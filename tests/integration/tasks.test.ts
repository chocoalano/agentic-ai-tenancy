/**
 * API tugas: pembuatan (otorisasi, validasi, idempotensi, batas), pembacaan,
 * pembatalan, dan status runtime agent. Membutuhkan PostgreSQL. Memakai
 * adapter FIXTURE (bukan AI); worker tidak dijalankan di sini.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
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
  type TestApp,
} from '../helpers/app'

const app = createTestApp({ AI_RUNTIME_PROVIDER: 'fixture' })
afterAll(() => app.close())

let owner: RegisteredUser & { tenantId: string }
let other: RegisteredUser & { tenantId: string }
let viewer: RegisteredUser
let member: RegisteredUser
let activeAgent = ''
let pausedAgent = ''

async function loginAs(target: TestApp, email: string) {
  const session = createSession(target)
  const { error } = await session.api.v1.auth.login.post({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`login gagal ${error.status}`)
  return session
}

beforeAll(async () => {
  owner = await registerOwner(app, 'task-owner', 'Tugas Tenant A')
  other = await registerOwner(app, 'task-other', 'Tugas Tenant B')
  viewer = await registerUser(app, 'task-viewer')
  member = await registerUser(app, 'task-member')
  const context = await ownerContext(app, owner.userId, owner.tenantId)
  const ids = await addAgents(app, context, [{ name: 'Sage Riset' }, { name: 'Agent Jeda', lifecycleStatus: 'paused' }])
  activeAgent = ids[0] ?? ''
  pausedAgent = ids[1] ?? ''
  await addMember(app, context, viewer.userId, 'viewer')
  await addMember(app, context, member.userId, 'member')
})

describe('kemampuan & pembuatan tugas', () => {
  test('capabilities jujur: runtime fixture tersedia (bukan AI), izin per peran', async () => {
    const { data } = await owner.api.v1.tasks.capabilities.get()
    expect(data?.runtime).toMatchObject({ available: true, kind: 'fixture', provider: 'fixture' })
    expect(data?.canCreate).toBe(true)
    expect(data?.canCancel).toBe(true)
    expect(data?.limits.maxInstructionChars).toBe(4000)
    const viewerSession = await loginAs(app, viewer.email)
    const viewerCaps = await viewerSession.api.v1.tasks.capabilities.get()
    expect(viewerCaps.data?.canCreate).toBe(false)
    expect(viewerCaps.data?.canCancel).toBe(false)
  })

  test('tugas dibuat 201 dengan run pertama queued; agent menampilkan status runtime otoritatif', async () => {
    const { data, error } = await owner.api.v1.tasks.post({
      agentId: activeAgent,
      instruction: 'Analisis pasar AI SaaS Indonesia dan buat ringkasan terstruktur.',
    })
    expect(error).toBeNull()
    expect(data?.created).toBe(true)
    expect(data?.task).toMatchObject({
      status: 'queued',
      attempts: 1,
      agentName: 'Sage Riset',
      requiresApproval: false,
      priority: 'normal',
    })
    expect(data?.task.title).toContain('Analisis pasar AI SaaS')
    expect(data?.task.latestRun).toMatchObject({ status: 'queued', attempt: 1, runtimeProvider: 'fixture' })
    const agents = await owner.api.v1.agents.get()
    const agent = agents.data?.items.find((item) => item.id === activeAgent)
    expect(agent?.runtimeStatus).toBe('thinking')
    expect(agent?.currentTaskId).toBe(data?.task.id ?? '')
    const detail = await owner.api.v1.tasks({ id: data?.task.id ?? '' }).get()
    expect(detail.data?.runs).toHaveLength(1)
    expect(detail.data?.output).toBeNull()
    await owner.api.v1.tasks({ id: data?.task.id ?? '' }).cancel.post()
  })

  test('idempotensi: kunci yang sama (termasuk 5 pengiriman paralel) menghasilkan satu tugas', async () => {
    const idempotencyKey = `submit-${randomUUID()}`
    const first = await owner.api.v1.tasks.post({
      agentId: activeAgent,
      instruction: 'Tugas idempoten',
      idempotencyKey,
    })
    expect(first.data?.created).toBe(true)
    const again = await owner.api.v1.tasks.post({
      agentId: activeAgent,
      instruction: 'Tugas idempoten',
      idempotencyKey,
    })
    expect(again.data?.created).toBe(false)
    expect(again.data?.task.id).toBe(first.data?.task.id ?? '')
    const parallelKey = `burst-${randomUUID()}`
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        owner.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Klik ganda', idempotencyKey: parallelKey }),
      ),
    )
    const ids = new Set(results.map((result) => result.data?.task.id ?? result.error?.status))
    expect(ids.size).toBe(1)
    const list = await owner.api.v1.tasks.get({ query: { limit: 100 } })
    expect(list.data?.items.filter((task) => task.instruction === 'Klik ganda')).toHaveLength(1)
    for (const id of [first.data?.task.id, [...ids][0]]) {
      if (typeof id === 'string') await owner.api.v1.tasks({ id }).cancel.post()
    }
  })

  test('validasi & otorisasi: kosong 422, terlalu panjang 422, agent asing 404, agent jeda 409, viewer 403', async () => {
    const empty = await owner.api.v1.tasks.post({ agentId: activeAgent, instruction: '   ' })
    expect(empty.error?.status).toBe(422)
    const long = await owner.api.v1.tasks.post({ agentId: activeAgent, instruction: 'x'.repeat(4001) })
    expect(long.error?.status).toBe(422)
    expect(long.error?.value).toMatchObject({ code: 'INSTRUCTION_TOO_LONG' })
    const unknown = await owner.api.v1.tasks.post({ agentId: randomUUID(), instruction: 'Halo' })
    expect(unknown.error?.status).toBe(404)
    const paused = await owner.api.v1.tasks.post({ agentId: pausedAgent, instruction: 'Halo' })
    expect(paused.error?.status).toBe(409)
    expect(paused.error?.value).toMatchObject({ code: 'AGENT_NOT_ASSIGNABLE' })
    const viewerSession = await loginAs(app, viewer.email)
    const forbidden = await viewerSession.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Halo' })
    expect(forbidden.error?.status).toBe(403)
    expect(forbidden.error?.value).toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  test('agent tenant lain tidak dapat ditugaskan dari tenant ini (404, keberadaan tidak bocor)', async () => {
    const contextB = await ownerContext(app, other.userId, other.tenantId)
    const [agentB] = await addAgents(app, contextB, [{ name: 'Bravo Agent' }])
    const { error } = await owner.api.v1.tasks.post({ agentId: agentB ?? '', instruction: 'Lintas tenant' })
    expect(error?.status).toBe(404)
  })

  test('runtime belum dikonfigurasi: tugas ditolak 409 RUNTIME_NOT_CONFIGURED tanpa membuat apa pun', async () => {
    const none = createTestApp({ AI_RUNTIME_PROVIDER: 'none' })
    try {
      const session = await loginAs(none, owner.email)
      const caps = await session.api.v1.tasks.capabilities.get()
      expect(caps.data?.runtime).toMatchObject({ available: false, kind: 'none' })
      expect(caps.data?.canCreate).toBe(false)
      const { error } = await session.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Halo' })
      expect(error?.status).toBe(409)
      expect(error?.value).toMatchObject({ code: 'RUNTIME_NOT_CONFIGURED' })
    } finally {
      await none.close()
    }
  })

  test('anggota dengan izin tasks.create dapat membuat; batas aktif per tenant dan laju per pengguna ditegakkan', async () => {
    const limited = createTestApp({
      AI_RUNTIME_PROVIDER: 'fixture',
      AI_TENANT_MAX_ACTIVE_RUNS: '1',
      RATE_LIMIT_TASK_CREATE_MAX: '2',
    })
    try {
      const session = await loginAs(limited, member.email)
      const first = await session.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Tugas anggota' })
      expect(first.data?.created).toBe(true)
      const second = await session.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Tugas kedua' })
      expect(second.error?.status).toBe(429)
      expect(second.error?.value).toMatchObject({ code: 'TOO_MANY_REQUESTS' })
      await session.api.v1.tasks({ id: first.data?.task.id ?? '' }).cancel.post()
      // Kuota laju: 2 percobaan sudah dipakai → percobaan ke-3 ditolak meski kapasitas tersedia.
      const third = await session.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Tugas ketiga' })
      expect(third.error?.status).toBe(429)
    } finally {
      await limited.close()
    }
  })
})

describe('pembacaan & pembatalan', () => {
  test('tugas tenant A tidak terlihat dari tenant B (daftar kosong, detail/run/output 404)', async () => {
    const created = await owner.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Rahasia tenant A' })
    const taskId = created.data?.task.id ?? ''
    const runId = created.data?.task.latestRun?.id ?? ''
    const list = await other.api.v1.tasks.get()
    expect(list.data?.items.map((task) => task.id)).not.toContain(taskId)
    expect((await other.api.v1.tasks({ id: taskId }).get()).error?.status).toBe(404)
    expect((await other.api.v1.tasks({ id: taskId }).runs.get()).data?.items).toEqual([])
    expect((await other.api.v1.runs({ id: runId }).get()).error?.status).toBe(404)
    expect((await other.api.v1.runs({ id: runId }).output.get()).error?.status).toBe(404)
    expect((await other.api.v1.tasks({ id: taskId }).cancel.post()).error?.status).toBe(404)
    await owner.api.v1.tasks({ id: taskId }).cancel.post()
  })

  test('pembatalan tugas antrean: tugas & run canceled; pembatalan ulang 409; viewer tanpa izin 403', async () => {
    const created = await owner.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Akan dibatalkan' })
    const taskId = created.data?.task.id ?? ''
    const viewerSession = await loginAs(app, viewer.email)
    const forbidden = await viewerSession.api.v1.tasks({ id: taskId }).cancel.post()
    expect(forbidden.error?.status).toBe(403)
    const canceled = await owner.api.v1.tasks({ id: taskId }).cancel.post()
    expect(canceled.data?.task).toMatchObject({ status: 'canceled', errorCode: 'CANCELED' })
    expect(canceled.data?.task.latestRun?.status).toBe('canceled')
    const again = await owner.api.v1.tasks({ id: taskId }).cancel.post()
    expect(again.error?.status).toBe(409)
    expect(again.error?.value).toMatchObject({ code: 'TASK_ALREADY_FINISHED' })
    const events = await owner.api.v1.runs({ id: created.data?.task.latestRun?.id ?? '' }).events.get()
    expect(events.data?.items.map((event) => event.eventType)).toEqual(['run.queued', 'run.canceled'])
    const agents = await owner.api.v1.agents.get()
    expect(agents.data?.items.find((item) => item.id === activeAgent)?.runtimeStatus).toBeNull()
  })

  test('riwayat tugas difilter per agent dan status; viewer (tasks.read) dapat membaca', async () => {
    const created = await owner.api.v1.tasks.post({ agentId: activeAgent, instruction: 'Riwayat' })
    const viewerSession = await loginAs(app, viewer.email)
    const list = await viewerSession.api.v1.tasks.get({ query: { agentId: activeAgent, status: 'queued' } })
    expect(list.data?.items.some((task) => task.id === created.data?.task.id)).toBe(true)
    for (const task of list.data?.items ?? []) expect(task.status).toBe('queued')
    await owner.api.v1.tasks({ id: created.data?.task.id ?? '' }).cancel.post()
  })
})
