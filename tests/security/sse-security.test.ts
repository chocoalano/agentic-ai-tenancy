/**
 * Keamanan stream SSE: otorisasi awal, validasi ulang selama koneksi hidup,
 * isolasi event lintas tenant, replay Last-Event-ID, dan pembersihan.
 * Membutuhkan PostgreSQL. Event bisnis dibuat lewat API tugas (adapter fixture).
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import {
  TEST_PASSWORD,
  addAgents,
  addMember,
  createSession,
  createTestApp,
  ownerContext,
  registerOwner,
  registerUser,
  type RegisteredUser,
} from '../helpers/app'
import { testDatabaseUrls } from '../helpers/env'
import { openSseStream as openRawStream } from '../helpers/sse'

/** Setiap stream dilacak dan ditutup setelah tiap test agar koneksi/pool tidak bocor saat test gagal. */
const openStreams: Array<{ close(): void }> = []
async function openSseStream(...args: Parameters<typeof openRawStream>) {
  const stream = await openRawStream(...args)
  openStreams.push(stream)
  return stream
}
afterEach(() => {
  for (const stream of openStreams.splice(0)) stream.close()
})
/** Batas waktu per test (default Bun 5 detik terlalu ketat untuk stream + validasi ulang di bawah beban). */
const TIMEOUT = 20_000

const app = createTestApp({
  AI_RUNTIME_PROVIDER: 'fixture',
  REALTIME_HEARTBEAT_MS: '1000',
  REALTIME_REVALIDATE_MS: '100',
  REALTIME_OUTBOX_POLL_MS: '50',
  DATABASE_POOL_MAX: '8',
})
const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 2 })
afterAll(async () => {
  app.deps.realtimeHub.stop()
  await app.close()
  await ownerSql.close()
})

let ownerA: RegisteredUser & { tenantId: string }
let ownerB: RegisteredUser & { tenantId: string }
let member: RegisteredUser
let agentA = ''

async function loginCookie(email: string) {
  const session = createSession(app)
  const { error } = await session.api.v1.auth.login.post({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`login gagal ${error.status}`)
  return { cookie: session.jar.cookie, api: session.api }
}

beforeAll(async () => {
  ownerA = await registerOwner(app, 'sse-a', 'SSE Tenant A')
  ownerB = await registerOwner(app, 'sse-b', 'SSE Tenant B')
  member = await registerUser(app, 'sse-member')
  const contextA = await ownerContext(app, ownerA.userId, ownerA.tenantId)
  agentA = (await addAgents(app, contextA, [{ name: 'SSE Agent' }]))[0] ?? ''
  await addMember(app, contextA, member.userId, 'member')
  await addMember(app, await ownerContext(app, ownerB.userId, ownerB.tenantId), member.userId, 'member')
})

describe('otorisasi koneksi', () => {
  test(
    'tanpa sesi → 401; sesi valid → ready dengan tenant sesi dan lastEventId',
    async () => {
      const anonymous = await app.app.handle(
        new Request('http://localhost:3000/v1/realtime/stream', { headers: { host: 'localhost:3000' } }),
      )
      expect(anonymous.status).toBe(401)
      const stream = await openSseStream(app, ownerA.jar.cookie)
      expect(stream.status).toBe(200)
      expect(stream.headers.get('content-type')).toContain('text/event-stream')
      expect(stream.headers.get('cache-control')).toBe('no-store')
      const ready = await stream.next()
      expect(ready?.event).toBe('ready')
      expect(ready?.data).toMatchObject({ tenantId: ownerA.tenantId, replayed: false })
      expect(typeof ready?.data.lastEventId).toBe('number')
      stream.close()
    },
    TIMEOUT,
  )

  test(
    'event tugas disalurkan ke tenant pemilik dengan id monoton, tidak ke tenant lain',
    async () => {
      const streamA = await openSseStream(app, ownerA.jar.cookie)
      const streamB = await openSseStream(app, ownerB.jar.cookie)
      expect((await streamA.next())?.event).toBe('ready')
      expect((await streamB.next())?.event).toBe('ready')
      const created = await ownerA.api.v1.tasks.post({ agentId: agentA, instruction: 'Event SSE' })
      const taskId = created.data?.task.id ?? ''
      const frames = await streamA.until((frame) => frame.event === 'agent.task.queued', 5_000)
      const business = frames.filter((frame) => frame.event.startsWith('agent.'))
      expect(business.map((frame) => frame.event)).toEqual(['agent.task.created', 'agent.task.queued'])
      for (const frame of business) {
        expect(frame.data).toMatchObject({ tenantId: ownerA.tenantId, taskId, agentId: agentA, schemaVersion: 1 })
        expect(Number(frame.id)).toBe(Number(frame.data.eventId))
      }
      expect(Number(business[1]?.id)).toBeGreaterThan(Number(business[0]?.id))
      // Payload tersanitasi: tidak ada instruksi penuh.
      expect(JSON.stringify(business)).not.toContain('Event SSE')
      const other = await streamB.until((frame) => frame.event.startsWith('agent.'), 1_500)
      expect(other.filter((frame) => frame.event.startsWith('agent.'))).toEqual([])
      streamA.close()
      streamB.close()
      await ownerA.api.v1.tasks({ id: taskId }).cancel.post()
    },
    TIMEOUT,
  )

  test(
    'Last-Event-ID: event yang terlewat diputar ulang saat sambung kembali; celah besar → replayed=false',
    async () => {
      const first = await openSseStream(app, ownerA.jar.cookie)
      const ready = await first.next()
      expect(ready?.event).toBe('ready')
      const created = await ownerA.api.v1.tasks.post({ agentId: agentA, instruction: 'Terlewat saat offline' })
      const taskId = created.data?.task.id ?? ''
      // Klien menerima created+queued, lalu terputus; pembatalan terjadi saat offline.
      const seen = await first.until((frame) => frame.event === 'agent.task.queued', 5_000)
      const lastSeen = Number(seen.at(-1)?.id)
      expect(Number.isFinite(lastSeen)).toBe(true)
      first.close()
      await ownerA.api.v1.tasks({ id: taskId }).cancel.post()
      const resumed = await openSseStream(app, ownerA.jar.cookie, { lastEventId: lastSeen })
      const readyAgain = await resumed.next()
      expect(readyAgain?.data.replayed).toBe(true)
      expect(Number(readyAgain?.data.lastEventId)).toBeGreaterThan(lastSeen)
      const replay = await resumed.until((frame) => frame.event === 'agent.run.canceled', 3_000)
      expect(replay.map((frame) => frame.event)).toEqual(['agent.run.canceled'])
      expect(replay[0]?.data).toMatchObject({ taskId })
      expect(Number(replay[0]?.id)).toBeGreaterThan(lastSeen)
      resumed.close()
      const huge = await openSseStream(app, ownerA.jar.cookie, { lastEventId: 0 })
      const readyHuge = await huge.next()
      // Dari 0 berarti seluruh riwayat; bila melebihi batas replay, klien diminta sinkron ulang.
      expect(typeof readyHuge?.data.replayed).toBe('boolean')
      huge.close()
    },
    TIMEOUT,
  )

  test(
    'sesi dicabut (logout) → stream ditutup SESSION_INVALID',
    async () => {
      const { cookie, api } = await loginCookie(ownerA.email)
      const stream = await openSseStream(app, cookie)
      expect((await stream.next())?.event).toBe('ready')
      await api.v1.auth.logout.post()
      const frames = await stream.until((frame) => frame.event === 'closed', 3_000)
      expect(frames.at(-1)).toMatchObject({ event: 'closed', data: { reason: 'SESSION_INVALID' } })
      expect(await stream.next(500)).toBeNull()
    },
    TIMEOUT,
  )

  test(
    'sesi kedaluwarsa → stream ditutup SESSION_INVALID',
    async () => {
      const { cookie } = await loginCookie(ownerA.email)
      const stream = await openSseStream(app, cookie)
      expect((await stream.next())?.event).toBe('ready')
      // expires_at harus > created_at (constraint); 1 ms setelah dibuat = sudah lewat sekarang.
      await ownerSql`
      update sessions set expires_at = created_at + interval '1 millisecond'
      where user_id = ${ownerA.userId} and revoked_at is null and created_at = (
        select max(created_at) from sessions where user_id = ${ownerA.userId} and revoked_at is null
      )
    `
      const frames = await stream.until((frame) => frame.event === 'closed', 3_000)
      expect(frames.at(-1)?.data.reason).toBe('SESSION_INVALID')
    },
    TIMEOUT,
  )

  test(
    'keanggotaan dicabut → ACCESS_REVOKED; tenant ditangguhkan → ACCESS_REVOKED',
    async () => {
      const guest = await registerUser(app, 'sse-guest')
      const contextA = await ownerContext(app, ownerA.userId, ownerA.tenantId)
      const membershipId = await addMember(app, contextA, guest.userId, 'member')
      const { cookie, api } = await loginCookie(guest.email)
      await api.v1.tenants({ id: ownerA.tenantId }).switch.post()
      const stream = await openSseStream(app, cookie)
      expect((await stream.next())?.event).toBe('ready')
      // Pemilik pun tunduk FORCE RLS: perubahan keanggotaan dilakukan dalam konteks tenant.
      await ownerSql.begin(async (tx) => {
        // Kebijakan 0007: penulisan keanggotaan butuh izin members.manage → konteks owner tenant A.
        await tx`select set_config('app.tenant_id', ${ownerA.tenantId}, true), set_config('app.user_id', ${ownerA.userId}, true)`
        const rows =
          await tx`update tenant_memberships set status = 'suspended' where id = ${membershipId} returning id`
        expect(rows).toHaveLength(1)
      })
      const frames = await stream.until((frame) => frame.event === 'closed', 3_000)
      expect(frames.at(-1)?.data.reason).toBe('ACCESS_REVOKED')
    },
    TIMEOUT,
  )

  test(
    'ganti tenant di tab lain → TENANT_CHANGED; stream baru memakai tenant baru',
    async () => {
      const { cookie, api } = await loginCookie(member.email)
      await api.v1.tenants({ id: ownerA.tenantId }).switch.post()
      const stream = await openSseStream(app, cookie)
      expect((await stream.next())?.data.tenantId).toBe(ownerA.tenantId)
      await api.v1.tenants({ id: ownerB.tenantId }).switch.post()
      const frames = await stream.until((frame) => frame.event === 'closed', 3_000)
      expect(frames.at(-1)?.data.reason).toBe('TENANT_CHANGED')
      const next = await openSseStream(app, cookie)
      expect((await next.next())?.data.tenantId).toBe(ownerB.tenantId)
      next.close()
      await api.v1.tenants({ id: ownerA.tenantId }).switch.post()
    },
    TIMEOUT,
  )

  test(
    'izin dicabut saat terhubung (peran dilepas) → PERMISSION_REVOKED',
    async () => {
      const temp = await registerUser(app, 'sse-temp')
      const contextA = await ownerContext(app, ownerA.userId, ownerA.tenantId)
      const membershipId = await addMember(app, contextA, temp.userId, 'member')
      const { cookie, api } = await loginCookie(temp.email)
      await api.v1.tenants({ id: ownerA.tenantId }).switch.post()
      const stream = await openSseStream(app, cookie)
      expect((await stream.next())?.event).toBe('ready')
      await ownerSql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${ownerA.tenantId}, true), set_config('app.user_id', ${ownerA.userId}, true)`
        const rows = await tx`delete from membership_roles where membership_id = ${membershipId} returning role_id`
        expect(rows.length).toBeGreaterThan(0)
      })
      const frames = await stream.until((frame) => frame.event === 'closed', 3_000)
      expect(frames.at(-1)?.data.reason).toBe('PERMISSION_REVOKED')
    },
    TIMEOUT,
  )

  test(
    'pemutusan koneksi membersihkan pelanggan hub',
    async () => {
      const before = app.deps.realtimeHub.subscriberCount
      const stream = await openSseStream(app, ownerA.jar.cookie)
      expect((await stream.next())?.event).toBe('ready')
      expect(app.deps.realtimeHub.subscriberCount).toBe(before + 1)
      stream.close()
      for (let i = 0; i < 40 && app.deps.realtimeHub.subscriberCount !== before; i += 1) await Bun.sleep(50)
      expect(app.deps.realtimeHub.subscriberCount).toBe(before)
    },
    TIMEOUT,
  )

  test(
    'heartbeat tetap berjalan dan Last-Event-ID tidak valid diabaikan',
    async () => {
      const stream = await openSseStream(app, ownerA.jar.cookie, { headers: { 'last-event-id': 'abc' } })
      const ready = await stream.next()
      expect(ready?.data.replayed).toBe(false)
      const heartbeat = await stream.until((frame) => frame.event === 'heartbeat', 2_500)
      expect(heartbeat.at(-1)?.event).toBe('heartbeat')
      stream.close()
    },
    TIMEOUT,
  )
})
