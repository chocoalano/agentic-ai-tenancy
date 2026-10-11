import { randomUUID } from 'node:crypto'
import { Elysia, sse } from 'elysia'
import type { OfficeRealtimeEvent } from '../../../domains/office/realtime'
import { guardPlugin } from '../../core/auth/guard'
import type { ApiConfig } from '../../core/config/env'
import type { AuthService } from '../auth/service'

/** Menunggu `ms` milidetik; selesai lebih cepat (mengembalikan true) bila koneksi diputus. */
function waitOrAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(false)
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      resolve(true)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Fondasi realtime Phase 1: stream SSE terautentikasi dan tenant-scoped.
 * Saat ini hanya mengirim `ready` dan `heartbeat` (status koneksi nyata),
 * belum ada event bisnis karena orchestrator agent belum ada. Kontrak event
 * didefinisikan di `domains/office/realtime.ts`.
 */
export function realtimeRoutes(deps: { config: ApiConfig; auth: AuthService }) {
  const interval = deps.config.realtime.heartbeatIntervalMs

  return new Elysia({ prefix: '/realtime', tags: ['Realtime'] }).use(guardPlugin(deps)).get(
    '/stream',
    async function* ({ tenant, request, set }) {
      set.headers['x-accel-buffering'] = 'no'
      const ready: OfficeRealtimeEvent = {
        event: 'ready',
        data: {
          tenantId: tenant.tenantId,
          connectionId: randomUUID(),
          serverTime: new Date(),
          heartbeatIntervalMs: interval,
        },
      }
      yield sse(ready)
      while (!(await waitOrAbort(interval, request.signal))) {
        const heartbeat: OfficeRealtimeEvent = { event: 'heartbeat', data: { serverTime: new Date() } }
        yield sse(heartbeat)
      }
    },
    {
      tenant: 'tenant.read',
      detail: {
        summary: 'Stream event Virtual Office (SSE)',
        description:
          'Server-Sent Events untuk tenant aktif. Event: `ready` (sekali di awal) dan `heartbeat` periodik. ' +
          'Koneksi ditutup bila klien memutus atau sesi/keanggotaan tidak valid saat koneksi dibuka.',
        security: [{ sessionCookie: [] }],
      },
    },
  )
}
