import { randomUUID } from 'node:crypto'
import type { SQL } from 'bun'
import { Elysia, sse, t } from 'elysia'
import {
  REALTIME_SCHEMA_VERSION,
  isAgentEventType,
  type OfficeRealtimeEvent,
  type RealtimeClosedEvent,
} from '../../../domains/office/realtime'
import { hasPermission, type TenantContext } from '../../../domains/tenancy/types'
import { guardPlugin } from '../../core/auth/guard'
import { readSessionCookie } from '../../core/auth/session-cookie'
import type { ApiConfig } from '../../core/config/env'
import { withTenantTransaction } from '../../core/database/transactions'
import { tenantErrors } from '../../core/errors/schemas'
import type { Logger } from '../../core/http/logger'
import type { AuthService } from '../auth/service'
import type { RealtimeHub } from './hub'
import { latestOutboxId, readTenantOutboxAfter, type OutboxRow } from './outbox'

const MAX_REPLAY = 500
const MAX_QUEUE = 1_000

/** Sumber bangun koneksi: event baru, heartbeat, atau pemutusan. */
class Waiter {
  private resolve: (() => void) | null = null
  private pending = false

  wake() {
    if (this.resolve) {
      const done = this.resolve
      this.resolve = null
      done()
    } else this.pending = true
  }

  /** Menunggu sampai dibangunkan, `ms` berlalu, atau `signal` dibatalkan. */
  wait(ms: number, signal: AbortSignal): Promise<'event' | 'timeout' | 'abort'> {
    if (signal.aborted) return Promise.resolve('abort')
    if (this.pending) {
      this.pending = false
      return Promise.resolve('event')
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup()
        resolve('timeout')
      }, ms)
      const onAbort = () => {
        cleanup()
        resolve('abort')
      }
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.resolve = null
      }
      this.resolve = () => {
        cleanup()
        resolve('event')
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

function toRealtimeEvent(row: OutboxRow): OfficeRealtimeEvent | null {
  if (!isAgentEventType(row.event_type)) return null
  const data = {
    ...row.payload,
    eventId: row.id,
    schemaVersion: row.schema_version ?? REALTIME_SCHEMA_VERSION,
    tenantId: row.tenant_id,
    agentId: row.agent_id ?? '',
    taskId: row.task_id ?? '',
    runId: row.run_id,
    occurredAt: row.created_at,
  }
  // Payload disimpan tersanitasi oleh penerbitnya; bentuk per tipe dijamin oleh service penerbit.
  return { event: row.event_type, data } as OfficeRealtimeEvent
}

/**
 * Stream SSE tenant-scoped dengan validasi ulang otorisasi selama koneksi
 * hidup (sesi, pengguna, keanggotaan, tenant aktif, izin). Event bisnis hanya
 * disalurkan ke koneksi ber-izin `tasks.read`, difilter per tenant, dengan
 * `id` = id outbox (replay `Last-Event-ID` di dalam retensi outbox).
 */
export function realtimeRoutes(deps: {
  config: ApiConfig
  auth: AuthService
  sql: SQL
  hub: RealtimeHub
  logger: Logger
}) {
  const heartbeatMs = deps.config.realtime.heartbeatIntervalMs
  const revalidateMs = deps.config.realtime.revalidateIntervalMs

  return new Elysia({ prefix: '/realtime', tags: ['Realtime'] }).use(guardPlugin(deps)).get(
    '/stream',
    async function* ({ tenant, request, set, cookie, query }) {
      set.headers['x-accel-buffering'] = 'no'
      set.headers['cache-control'] = 'no-store'
      const token = readSessionCookie(cookie, deps.config)
      const connectionId = randomUUID()
      let context: TenantContext = tenant
      let canReceiveBusiness = hasPermission(context, 'tasks.read')
      let lastValidatedAt = Date.now()

      const queue: OutboxRow[] = []
      const waiter = new Waiter()
      let dropped = 0
      const unsubscribe = deps.hub.subscribe({
        tenantId: context.tenantId,
        deliver(row) {
          if (queue.length >= MAX_QUEUE) {
            dropped += 1
            return
          }
          queue.push(row)
          waiter.wake()
        },
      })

      /** Memvalidasi ulang otorisasi; mengembalikan alasan penutupan bila tidak valid lagi. */
      async function revalidate(): Promise<RealtimeClosedEvent['data']['reason'] | null> {
        lastValidatedAt = Date.now()
        const session = token === undefined ? null : await deps.auth.authenticate(token)
        if (!session) return 'SESSION_INVALID'
        if (session.activeTenantId !== context.tenantId) return 'TENANT_CHANGED'
        const next = await deps.auth.activeTenantFor(session, `sse:${connectionId}`)
        if (!next) return 'ACCESS_REVOKED'
        if (!hasPermission(next, 'tenant.read')) return 'PERMISSION_REVOKED'
        context = next
        canReceiveBusiness = hasPermission(next, 'tasks.read')
        return null
      }

      try {
        // Replay event yang terlewat (Last-Event-ID) di dalam konteks tenant (RLS membatasi).
        const headerId = request.headers.get('last-event-id') ?? query.lastEventId
        const lastEventId = headerId !== undefined && /^\d{1,18}$/.test(headerId) ? Number(headerId) : null
        let replay: OutboxRow[] = []
        let replayed = false
        if (lastEventId !== null && canReceiveBusiness) {
          replay = await withTenantTransaction(deps.sql, context, (scope) =>
            readTenantOutboxAfter(scope, lastEventId, MAX_REPLAY + 1),
          )
          // Lebih dari batas = celah terlalu besar; klien harus sinkron ulang dari snapshot.
          replayed = replay.length <= MAX_REPLAY
          if (!replayed) replay = []
        }
        // Titik awal replay yang akurat (id outbox terbaru saat ini), bukan kursor hub yang mungkin tertinggal.
        const cursor = Math.max(await latestOutboxId(deps.sql), replay.at(-1)?.id ?? 0, lastEventId ?? 0)
        const ready: OfficeRealtimeEvent = {
          event: 'ready',
          data: {
            tenantId: context.tenantId,
            connectionId,
            serverTime: new Date(),
            heartbeatIntervalMs: heartbeatMs,
            lastEventId: cursor,
            replayed,
          },
        }
        yield sse(ready)
        let lastSentId = lastEventId ?? 0
        for (const row of replay) {
          const event = toRealtimeEvent(row)
          if (!event) continue
          lastSentId = row.id
          yield sse({ ...event, id: String(row.id) })
        }

        while (!request.signal.aborted) {
          const outcome = await waiter.wait(heartbeatMs, request.signal)
          if (outcome === 'abort') break
          if (
            Date.now() - lastValidatedAt >= revalidateMs ||
            (outcome === 'event' && queue.length > 0 && Date.now() - lastValidatedAt >= revalidateMs)
          ) {
            const reason = await revalidate()
            if (reason) {
              const closed: RealtimeClosedEvent = { event: 'closed', data: { reason, serverTime: new Date() } }
              yield sse(closed)
              return
            }
          }
          if (outcome === 'timeout') {
            const heartbeat: OfficeRealtimeEvent = { event: 'heartbeat', data: { serverTime: new Date() } }
            yield sse(heartbeat)
            continue
          }
          while (queue.length > 0) {
            const row = queue.shift()
            if (!row || row.id <= lastSentId) continue
            if (row.tenant_id !== context.tenantId || !canReceiveBusiness) continue
            const event = toRealtimeEvent(row)
            if (!event) continue
            lastSentId = row.id
            yield sse({ ...event, id: String(row.id) })
          }
          if (dropped > 0) {
            deps.logger.warn('Antrean SSE penuh; klien harus sinkron ulang', { connectionId, dropped })
            dropped = 0
          }
        }
      } finally {
        unsubscribe()
      }
    },
    {
      tenant: 'tenant.read',
      query: t.Object({ lastEventId: t.Optional(t.String({ pattern: '^\\d{1,18}$' })) }),
      response: { ...tenantErrors },
      detail: {
        summary: 'Stream event Virtual Office (SSE)',
        description:
          'Server-Sent Events untuk tenant aktif. Event: `ready` (sekali di awal, membawa `lastEventId`), `heartbeat` ' +
          'periodik, event bisnis `agent.*`/`approval.*` (hanya untuk izin `tasks.read`, `id` = id outbox untuk ' +
          '`Last-Event-ID`), dan `closed` bila sesi/keanggotaan/izin tidak lagi valid (divalidasi ulang berkala). ' +
          'Koneksi ditolak bila sesi/keanggotaan tidak valid saat dibuka.',
        security: [{ sessionCookie: [] }],
      },
    },
  )
}
