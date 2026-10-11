/**
 * Worker eksekusi: klaim atomik, eksekusi lewat adapter FIXTURE (bukan AI),
 * persistensi hasil, percobaan ulang, pemulihan lease, pembatalan, persetujuan,
 * proteksi state terminal, dan shutdown. Membutuhkan PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { withTenantTransaction } from '../../api/core/database/transactions'
import { runsRepository } from '../../api/modules/runs/repository'
import { createExecutionWorker, type ExecutionWorker } from '../../api/modules/runs/worker'
import { tasksRepository } from '../../api/modules/tasks/repository'
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
import { testDatabaseUrls } from '../helpers/env'

const BASE_ENV = {
  AI_RUNTIME_PROVIDER: 'fixture',
  AI_WORKER_POLL_MS: '50',
  AI_RUN_LEASE_SECONDS: '5',
  AI_RUN_MAX_ATTEMPTS: '2',
  AI_WORKER_CONCURRENCY: '2',
  AI_TENANT_MAX_ACTIVE_RUNS: '10',
}

const app = createTestApp(BASE_ENV)
const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 2 })
afterAll(async () => {
  await app.close()
  await ownerSql.close()
})

let owner: RegisteredUser & { tenantId: string }
let other: RegisteredUser & { tenantId: string }
let admin: RegisteredUser
let agentId = ''

function workerFor(target: TestApp, workerId: string): ExecutionWorker {
  return createExecutionWorker({
    ...target.deps,
    config: { ...target.config, worker: { ...target.config.worker, workerId } },
  })
}

/** Putaran sampai dua tick berturut-turut tidak mengklaim apa pun (antrean kosong, termasuk percobaan ulang). */
async function runUntilIdle(worker: ExecutionWorker, maxTicks = 30) {
  let idle = 0
  for (let i = 0; i < maxTicks && idle < 2; i += 1) {
    const claimed = await worker.tick()
    await worker.drain()
    idle = claimed === 0 && worker.active === 0 ? idle + 1 : 0
  }
  await worker.drain()
}

async function loginAs(target: TestApp, email: string) {
  const session = createSession(target)
  const { error } = await session.api.v1.auth.login.post({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`login gagal ${error.status}`)
  return session
}

async function createTask(instruction: string, extra: { requiresApproval?: boolean } = {}) {
  const { data, error } = await owner.api.v1.tasks.post({ agentId, instruction, ...extra })
  if (error || !data) throw new Error(`gagal membuat tugas: ${error?.status}`)
  return { taskId: data.task.id, runId: data.task.latestRun?.id ?? '' }
}

beforeAll(async () => {
  owner = await registerOwner(app, 'worker-owner', 'Worker Tenant A')
  other = await registerOwner(app, 'worker-other', 'Worker Tenant B')
  admin = await registerUser(app, 'worker-admin')
  const context = await ownerContext(app, owner.userId, owner.tenantId)
  agentId = (await addAgents(app, context, [{ name: 'Sage Worker' }]))[0] ?? ''
  await addMember(app, context, admin.userId, 'admin')
})

describe('eksekusi tugas oleh worker', () => {
  test('jalur bahagia: klaim → running → hasil dipersistenkan → completed; event & outbox lengkap', async () => {
    const { taskId, runId } = await createTask('Susun ringkasan pasar AI SaaS Indonesia.')
    const worker = workerFor(app, 'w-happy')
    // Antrean dibagi semua tenant (test lain dapat menyisakan run antrean): yang penting run kita selesai.
    expect(await worker.tick()).toBeGreaterThanOrEqual(1)
    await runUntilIdle(worker)

    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('completed')
    expect(detail.data?.completedAt).not.toBeNull()
    expect(detail.data?.runs).toHaveLength(1)
    expect(detail.data?.runs[0]).toMatchObject({ status: 'completed', attempt: 1, runtimeProvider: 'fixture' })
    expect(detail.data?.runs[0]?.providerRequestId).toMatch(/^fixture-/)
    expect(detail.data?.runs[0]?.usage).toBeNull()
    expect(detail.data?.output).toMatchObject({ runId, released: true, outputType: 'text' })

    const output = await owner.api.v1.runs({ id: runId }).output.get()
    expect(output.data?.content).toContain('FIXTURE DETERMINISTIK — BUKAN HASIL MODEL AI')
    expect(output.data?.content).toContain('Susun ringkasan pasar AI SaaS Indonesia.')

    const events = await owner.api.v1.runs({ id: runId }).events.get()
    expect(events.data?.items.map((event) => event.eventType)).toEqual([
      'run.queued',
      'run.started',
      'provider.started',
      'activity',
      'run.completed',
    ])
    const outbox = await ownerSql<{ event_type: string }[]>`
      select event_type from realtime_outbox where task_id = ${taskId} order by id
    `
    expect(outbox.map((row) => row.event_type)).toEqual([
      'agent.task.created',
      'agent.task.queued',
      'agent.run.started',
      'agent.run.activity',
      'agent.run.completed',
    ])
    const agents = await owner.api.v1.agents.get()
    expect(agents.data?.items.find((item) => item.id === agentId)?.runtimeStatus).toBeNull()
  }, 30_000)

  test('klaim ganda: dua worker bersaing pada satu run → hanya satu yang mengklaim dan satu hasil', async () => {
    const { taskId, runId } = await createTask('Tugas rebutan klaim.')
    const a = workerFor(app, 'w-race-a')
    const b = workerFor(app, 'w-race-b')
    await Promise.all([a.tick(), b.tick()])
    await Promise.all([runUntilIdle(a), runUntilIdle(b)])
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('completed')
    expect(detail.data?.runs).toHaveLength(1)
    // Tepat satu worker yang memilikinya (klaim atomik), tanpa run tambahan.
    const [row] = await ownerSql<{ worker_id: string }[]>`select worker_id from agent_runs where id = ${runId}`
    expect(['w-race-a', 'w-race-b']).toContain(row?.worker_id ?? '')
    const outputs = await ownerSql`select id from agent_run_outputs where run_id = ${runId}`
    expect(outputs).toHaveLength(1)
  }, 30_000)

  test('worker mati setelah klaim: lease kedaluwarsa dipulihkan, percobaan ke-2 selesai, tanpa hasil ganda', async () => {
    const { taskId, runId } = await createTask('Tugas pulih dari crash.')
    // Simulasi worker yang mengklaim lalu mati: klaim lewat fungsi definer tanpa memproses.
    const [claim] = await app.sql<{ run_id: string }[]>`select run_id from app.claim_agent_run('w-crashed', 5)`
    expect(claim?.run_id).toBe(runId)
    await ownerSql`update agent_runs set lease_expires_at = now() - interval '1 second' where id = ${runId}`

    const rescuer = workerFor(app, 'w-rescuer')
    await runUntilIdle(rescuer)
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('completed')
    expect(detail.data?.attempts).toBe(2)
    expect(detail.data?.runs.map((run) => [run.attempt, run.status, run.errorCode])).toEqual([
      [1, 'failed', 'LEASE_EXPIRED'],
      [2, 'completed', null],
    ])
    const outputs = await ownerSql`select run_id from agent_run_outputs where task_id = ${taskId}`
    expect(outputs).toHaveLength(1)
    const stale = await owner.api.v1.runs({ id: runId }).output.get()
    expect(stale.error?.status).toBe(404)
  }, 30_000)

  test('kegagalan retryable (timeout provider) dicoba ulang sampai kuota habis → ATTEMPTS_EXHAUSTED', async () => {
    const { taskId } = await createTask('Riset [fixture:timeout]')
    const worker = workerFor(app, 'w-retry')
    await runUntilIdle(worker)
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('failed')
    expect(detail.data?.errorCode).toBe('ATTEMPTS_EXHAUSTED')
    expect(detail.data?.attempts).toBe(2)
    expect(detail.data?.runs.map((run) => [run.attempt, run.status, run.errorCode, run.retryable])).toEqual([
      [1, 'failed', 'PROVIDER_TIMEOUT', true],
      [2, 'failed', 'PROVIDER_TIMEOUT', true],
    ])
    expect(detail.data?.output).toBeNull()
  }, 30_000)

  test('kegagalan non-retryable (provider menolak / keluaran terlalu besar) tidak dicoba ulang', async () => {
    const rejected = await createTask('Riset [fixture:fail]')
    const large = await createTask('Riset [fixture:large]')
    const worker = workerFor(app, 'w-fail')
    await runUntilIdle(worker)
    const a = await owner.api.v1.tasks({ id: rejected.taskId }).get()
    expect(a.data).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_REJECTED', attempts: 1 })
    const b = await owner.api.v1.tasks({ id: large.taskId }).get()
    expect(b.data).toMatchObject({ status: 'failed', errorCode: 'OUTPUT_TOO_LARGE', attempts: 1 })
    expect(b.data?.runs[0]?.retryable).toBe(false)
  }, 30_000)

  test('pembatalan saat eksekusi berjalan: worker berhenti, run & tugas canceled, tanpa hasil', async () => {
    const { taskId, runId } = await createTask('Riset lambat [fixture:slow:4000]')
    const worker = workerFor(app, 'w-cancel')
    expect(await worker.tick()).toBeGreaterThanOrEqual(1)
    // Tunggu sampai run berstatus running, lalu batalkan lewat API.
    for (let i = 0; i < 40; i += 1) {
      const run = await owner.api.v1.runs({ id: runId }).get()
      if (run.data?.status === 'running') break
      await Bun.sleep(50)
    }
    const canceled = await owner.api.v1.tasks({ id: taskId }).cancel.post()
    expect(canceled.data?.task.status).toBe('running')
    expect(canceled.data?.task.latestRun?.cancelRequested).toBe(true)
    await worker.drain()
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('canceled')
    expect(detail.data?.runs[0]).toMatchObject({ status: 'canceled', errorCode: 'CANCELED' })
    expect(detail.data?.output).toBeNull()
  }, 30_000)

  test('state terminal terlindungi dari event terlambat (compare-and-swap)', async () => {
    const { taskId, runId } = await createTask('Tugas terminal.')
    const worker = workerFor(app, 'w-terminal')
    await runUntilIdle(worker)
    const context = await ownerContext(app, owner.userId, owner.tenantId)
    await withTenantTransaction(app.sql, context, async (scope) => {
      const stale = await runsRepository.finish(scope, { id: runId, workerId: null, from: ['running'], to: 'failed' })
      expect(stale).toBeNull()
      const failedTask = await tasksRepository.markFailed(scope, { id: taskId, errorCode: 'X', errorMessage: 'x' })
      expect(failedTask).toBeNull()
      const requeued = await tasksRepository.markQueued(scope, { id: taskId, runId, attempts: 9 })
      expect(requeued).toBeNull()
    })
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('completed')
    expect(detail.data?.attempts).toBe(1)
  }, 30_000)

  test('shutdown saat eksekusi: run dilepas kembali ke antrean dan worker lain menyelesaikannya', async () => {
    const { taskId, runId } = await createTask('Riset lambat [fixture:slow:4000]')
    const first = workerFor(app, 'w-shutdown')
    expect(await first.tick()).toBeGreaterThanOrEqual(1)
    for (let i = 0; i < 40; i += 1) {
      const run = await owner.api.v1.runs({ id: runId }).get()
      if (run.data?.status === 'running') break
      await Bun.sleep(50)
    }
    await first.stop()
    const released = await owner.api.v1.runs({ id: runId }).get()
    expect(released.data?.status).toBe('queued')
    const second = workerFor(app, 'w-after-shutdown')
    await runUntilIdle(second)
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data?.status).toBe('completed')
    expect(detail.data?.runs).toHaveLength(1)
  }, 30_000)

  test('worker dengan runtime none tidak mengklaim apa pun (eksekusi nyata tidak tersedia)', async () => {
    const none = createTestApp({ ...BASE_ENV, AI_RUNTIME_PROVIDER: 'none' })
    try {
      const { taskId } = await createTask('Tugas menunggu runtime.')
      const worker = workerFor(none, 'w-none')
      // Worker tetap mengklaim antrean (tugas dibuat saat fixture tersedia) tetapi runtime none → gagal jujur.
      await runUntilIdle(worker)
      const detail = await owner.api.v1.tasks({ id: taskId }).get()
      expect(detail.data?.status).toBe('failed')
      expect(detail.data?.errorCode).toBe('RUNTIME_NOT_CONFIGURED')
    } finally {
      await none.close()
    }
  }, 30_000)
})

describe('persetujuan manusia (aksi dilindungi: rilis hasil)', () => {
  test('tugas berpersetujuan: hasil ditahan (409) sampai disetujui; setelah disetujui tugas completed', async () => {
    const { taskId, runId } = await createTask('Laporan sensitif.', { requiresApproval: true })
    const worker = workerFor(app, 'w-approval')
    await runUntilIdle(worker)
    const pending = await owner.api.v1.tasks({ id: taskId }).get()
    expect(pending.data?.status).toBe('waiting_approval')
    expect(pending.data?.runs[0]?.status).toBe('waiting_approval')
    expect(pending.data?.output).toMatchObject({ released: false })
    const blocked = await owner.api.v1.runs({ id: runId }).output.get()
    expect(blocked.error?.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'OUTPUT_PENDING_APPROVAL' })
    const agents = await owner.api.v1.agents.get()
    expect(agents.data?.items.find((item) => item.id === agentId)?.runtimeStatus).toBe('waiting_approval')

    const list = await owner.api.v1.approvals.get({ query: { status: 'pending' } })
    const approval = list.data?.items.find((item) => item.runId === runId)
    expect(approval).toMatchObject({ actionType: 'release_result', status: 'pending', taskId })

    // Viewer tanpa approvals.decide tidak boleh memutuskan.
    const viewer = await registerUser(app, 'worker-viewer')
    await addMember(app, await ownerContext(app, owner.userId, owner.tenantId), viewer.userId, 'viewer')
    const viewerSession = await loginAs(app, viewer.email)
    const forbidden = await viewerSession.api.v1
      .approvals({ id: approval?.id ?? '' })
      .decide.post({ decision: 'approve' })
    expect(forbidden.error?.status).toBe(403)
    // Tenant lain: 404.
    const foreign = await other.api.v1.approvals({ id: approval?.id ?? '' }).decide.post({ decision: 'approve' })
    expect(foreign.error?.status).toBe(404)

    const decided = await owner.api.v1
      .approvals({ id: approval?.id ?? '' })
      .decide.post({ decision: 'approve', note: 'OK' })
    expect(decided.data).toMatchObject({ status: 'approved', decidedByUserId: owner.userId, decisionNote: 'OK' })
    const done = await owner.api.v1.tasks({ id: taskId }).get()
    expect(done.data?.status).toBe('completed')
    expect(done.data?.output?.released).toBe(true)
    const output = await owner.api.v1.runs({ id: runId }).output.get()
    expect(output.data?.released).toBe(true)
    const twice = await owner.api.v1.approvals({ id: approval?.id ?? '' }).decide.post({ decision: 'reject' })
    expect(twice.error?.status).toBe(409)
    expect(twice.error?.value).toMatchObject({ code: 'APPROVAL_ALREADY_DECIDED' })
    const outbox = await ownerSql<{ event_type: string }[]>`
      select event_type from realtime_outbox where task_id = ${taskId} order by id
    `
    expect(outbox.map((row) => row.event_type)).toEqual([
      'agent.task.created',
      'agent.task.queued',
      'agent.run.started',
      'agent.run.activity',
      'agent.run.waiting_approval',
      'approval.requested',
      'approval.decided',
      'agent.run.completed',
    ])
  }, 30_000)

  test('penolakan menggagalkan tugas (APPROVAL_REJECTED) dan hasil tetap tidak dirilis', async () => {
    const { taskId, runId } = await createTask('Laporan ditolak.', { requiresApproval: true })
    await runUntilIdle(workerFor(app, 'w-reject'))
    const list = await owner.api.v1.approvals.get({ query: { status: 'pending' } })
    const approval = list.data?.items.find((item) => item.runId === runId)
    const rejected = await owner.api.v1.approvals({ id: approval?.id ?? '' }).decide.post({ decision: 'reject' })
    expect(rejected.data?.status).toBe('rejected')
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data).toMatchObject({ status: 'failed', errorCode: 'APPROVAL_REJECTED' })
    expect((await owner.api.v1.runs({ id: runId }).output.get()).error?.status).toBe(409)
  }, 30_000)

  test('kebijakan larangan keputusan sendiri: pembuat tugas 403, admin lain boleh', async () => {
    const strict = createTestApp({ ...BASE_ENV, APPROVAL_FORBID_SELF: 'true' })
    try {
      const { taskId, runId } = await createTask('Laporan butuh orang lain.', { requiresApproval: true })
      await runUntilIdle(workerFor(strict, 'w-self'))
      const list = await owner.api.v1.approvals.get({ query: { status: 'pending' } })
      const approval = list.data?.items.find((item) => item.runId === runId)
      const ownerStrict = await loginAs(strict, owner.email)
      const self = await ownerStrict.api.v1.approvals({ id: approval?.id ?? '' }).decide.post({ decision: 'approve' })
      expect(self.error?.status).toBe(403)
      expect(self.error?.value).toMatchObject({ code: 'APPROVAL_SELF_DECISION' })
      const adminStrict = await loginAs(strict, admin.email)
      await adminStrict.api.v1.tenants({ id: owner.tenantId }).switch.post()
      const decided = await adminStrict.api.v1
        .approvals({ id: approval?.id ?? '' })
        .decide.post({ decision: 'approve' })
      expect(decided.data?.status).toBe('approved')
      expect((await owner.api.v1.tasks({ id: taskId }).get()).data?.status).toBe('completed')
    } finally {
      await strict.close()
    }
  }, 30_000)

  test('persetujuan kedaluwarsa disapu worker: status expired, tugas gagal APPROVAL_EXPIRED', async () => {
    const { taskId, runId } = await createTask('Laporan kedaluwarsa.', { requiresApproval: true })
    const worker = workerFor(app, 'w-expire')
    await runUntilIdle(worker)
    await ownerSql`update agent_approvals set expires_at = now() - interval '1 minute' where run_id = ${runId}`
    await worker.tick()
    const list = await owner.api.v1.approvals.get({ query: { status: 'expired' } })
    expect(list.data?.items.some((item) => item.runId === runId)).toBe(true)
    const detail = await owner.api.v1.tasks({ id: taskId }).get()
    expect(detail.data).toMatchObject({ status: 'failed', errorCode: 'APPROVAL_EXPIRED' })
    const late = await owner.api.v1
      .approvals({ id: list.data?.items.find((item) => item.runId === runId)?.id ?? '' })
      .decide.post({ decision: 'approve' })
    expect(late.error?.status).toBe(409)
  }, 30_000)

  test('pembatalan saat menunggu persetujuan menutup permintaan dan membatalkan tugas', async () => {
    const { taskId, runId } = await createTask('Laporan dibatalkan.', { requiresApproval: true })
    await runUntilIdle(workerFor(app, 'w-cancel-approval'))
    const canceled = await owner.api.v1.tasks({ id: taskId }).cancel.post()
    expect(canceled.data?.task.status).toBe('canceled')
    const list = await owner.api.v1.approvals.get({ query: { status: 'canceled' } })
    expect(list.data?.items.some((item) => item.runId === runId)).toBe(true)
  }, 30_000)
})
