/**
 * Isolasi tenant untuk tugas/run/output/persetujuan/outbox langsung di PostgreSQL
 * (role runtime, RLS), termasuk fungsi SECURITY DEFINER sempit. Membutuhkan PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { describeRuntimeRoleProblems, inspectRuntimeRole } from '../../api/core/database/safety'
import { withTenantTransaction, withWorkerTransaction } from '../../api/core/database/transactions'
import { runsRepository } from '../../api/modules/runs/repository'
import { tasksRepository } from '../../api/modules/tasks/repository'
import { addAgents, createTestApp, ownerContext, registerOwner } from '../helpers/app'
import { testDatabaseUrls } from '../helpers/env'

const app = createTestApp({ AI_RUNTIME_PROVIDER: 'fixture' })
const ownerSql = new SQL({ url: testDatabaseUrls().owner, max: 2 })
afterAll(async () => {
  await app.close()
  await ownerSql.close()
})

const run = <T>(query: () => Promise<T>) => (async () => query())()

let tenantA = ''
let tenantB = ''
let agentA = ''
let agentB = ''
let taskA = ''
let runA = ''
let contextA: Awaited<ReturnType<typeof ownerContext>>
let contextB: Awaited<ReturnType<typeof ownerContext>>

beforeAll(async () => {
  const a = await registerOwner(app, 'tiso-a', 'Isolasi Tugas A')
  const b = await registerOwner(app, 'tiso-b', 'Isolasi Tugas B')
  tenantA = a.tenantId
  tenantB = b.tenantId
  contextA = await ownerContext(app, a.userId, tenantA)
  contextB = await ownerContext(app, b.userId, tenantB)
  agentA = (await addAgents(app, contextA, [{ name: 'Iso Agent A' }]))[0] ?? ''
  agentB = (await addAgents(app, contextB, [{ name: 'Iso Agent B' }]))[0] ?? ''
  const created = await a.api.v1.tasks.post({ agentId: agentA, instruction: 'Rahasia A', requiresApproval: true })
  taskA = created.data?.task.id ?? ''
  runA = created.data?.task.latestRun?.id ?? ''
})

describe('RLS tabel tugas', () => {
  test('role runtime tetap aman; semua tabel baru terdaftar dan memakai FORCE RLS', async () => {
    const report = await inspectRuntimeRole(app.sql)
    expect(describeRuntimeRoleProblems(report)).toEqual([])
    expect(report.unlistedTenantTables).toEqual([])
  })

  test('tenant B tidak melihat tugas/run/outbox tenant A (0 baris) dan tidak dapat mengubahnya', async () => {
    await withTenantTransaction(app.sql, contextB, async ({ sql }) => {
      expect(await sql`select id from agent_tasks where id = ${taskA}`).toHaveLength(0)
      expect(await sql`select id from agent_runs where id = ${runA}`).toHaveLength(0)
      expect(await sql`select id from realtime_outbox where task_id = ${taskA}`).toHaveLength(0)
      expect(await sql`update agent_tasks set status = 'canceled' where id = ${taskA} returning id`).toHaveLength(0)
      expect(await sql`update agent_runs set cancel_requested = true where id = ${runA} returning id`).toHaveLength(0)
    })
  })

  test('tenant B tidak dapat membuat run/tugas untuk agent tenant A (FK komposit + RLS)', async () => {
    await expect(
      run(() =>
        withTenantTransaction(
          app.sql,
          contextB,
          ({ sql }) =>
            sql`insert into agent_runs (tenant_id, task_id, agent_id, attempt, runtime_provider, runtime_model)
              values (${tenantB}, ${taskA}, ${agentA}, 2, 'fixture', 'x')`,
        ),
      ),
    ).rejects.toThrow()
    await expect(
      run(() =>
        withTenantTransaction(
          app.sql,
          contextB,
          ({ sql }) =>
            sql`insert into agent_tasks (tenant_id, agent_id, created_by_user_id, title, instruction)
              values (${tenantB}, ${agentA}, ${contextB.userId}, 'x', 'x')`,
        ),
      ),
    ).rejects.toThrow()
    // Dalam konteks tenant A pun, tenant_id lain ditolak (with check).
    await expect(
      run(() =>
        withTenantTransaction(
          app.sql,
          contextA,
          ({ sql }) =>
            sql`insert into agent_tasks (tenant_id, agent_id, created_by_user_id, title, instruction)
              values (${tenantB}, ${agentB}, ${contextA.userId}, 'x', 'x')`,
        ),
      ),
    ).rejects.toThrow()
  })

  test('izin ditegakkan database: pengguna tanpa tasks.create tidak dapat menyisipkan tugas meski konteks tenant benar', async () => {
    const viewerContext = { ...contextA, permissions: contextA.permissions.filter((p) => p !== 'tasks.create') }
    // RLS membaca izin dari database (bukan dari objek konteks): buat anggota viewer sungguhan.
    const { registerUser, addMember } = await import('../helpers/app')
    const viewer = await registerUser(app, 'tiso-viewer')
    await addMember(app, contextA, viewer.userId, 'viewer')
    const { resolveTenantContext } = await import('../../api/core/tenancy/resolve-context')
    const resolved = await resolveTenantContext(app.sql, { userId: viewer.userId, tenantId: tenantA, requestId: 't' })
    if (!resolved) throw new Error('konteks viewer tidak terselesaikan')
    expect(resolved.permissions).not.toContain('tasks.create')
    void viewerContext
    await expect(
      run(() =>
        withTenantTransaction(app.sql, resolved, (scope) =>
          tasksRepository.create(scope, {
            agentId: agentA,
            createdByUserId: resolved.userId,
            title: 'x',
            instruction: 'x',
            priority: 'normal',
            requiresApproval: false,
            idempotencyKey: null,
            maxAttempts: 1,
          }),
        ),
      ),
    ).rejects.toThrow()
  })

  test('worker hanya menulis output/persetujuan dalam konteks worker; konteks pengguna biasa ditolak', async () => {
    await expect(
      run(() =>
        withTenantTransaction(app.sql, contextA, (scope) =>
          runsRepository.saveOutput(scope, {
            runId: runA,
            taskId: taskA,
            outputType: 'text',
            content: 'x',
            released: true,
          }),
        ),
      ),
    ).rejects.toThrow()
    // Worker tenant B tidak dapat menulis ke run tenant A.
    await expect(
      run(() =>
        withWorkerTransaction(app.sql, { tenantId: tenantB, workerId: 'w' }, (scope) =>
          runsRepository.saveOutput(scope, {
            runId: runA,
            taskId: taskA,
            outputType: 'text',
            content: 'x',
            released: true,
          }),
        ),
      ),
    ).rejects.toThrow()
  })

  test('akses lintas tenant hanya lewat fungsi definer: select langsung tanpa konteks = 0 baris, fungsi klaim melihat antrean', async () => {
    const direct = await app.sql`select id from agent_runs where id = ${runA}`
    expect(direct).toHaveLength(0)
    const outboxDirect = await app.sql`select id from realtime_outbox where task_id = ${taskA}`
    expect(outboxDirect).toHaveLength(0)
    const viaFunction = await app.sql<
      { id: number | string; tenant_id: string }[]
    >`select id, tenant_id from app.realtime_outbox_after(0, 1000)`
    expect(viaFunction.some((row) => row.tenant_id === tenantA)).toBe(true)
    const [claim] = await app.sql<
      { run_id: string; tenant_id: string }[]
    >`select run_id, tenant_id from app.claim_agent_run('tiso-worker', 30)`
    expect(claim?.tenant_id).toBeDefined()
    // Role runtime tidak dapat membuat fungsi definer sendiri maupun mengubah kebijakan.
    await expect(run(() => app.sql`alter table agent_tasks disable row level security`)).rejects.toThrow()
    await expect(run(() => app.sql`drop policy agent_tasks_select on agent_tasks`)).rejects.toThrow()
    await expect(run(() => app.sql`delete from realtime_outbox`)).rejects.toThrow()
  })

  test('transaksi tenant paralel tetap terisolasi (konteks transaction-local, pool bersama)', async () => {
    const reads = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        index % 2 === 0
          ? withTenantTransaction(
              app.sql,
              contextA,
              ({ sql }) => sql<{ tenant_id: string }[]>`select tenant_id from agent_tasks`,
            )
          : withTenantTransaction(
              app.sql,
              contextB,
              ({ sql }) => sql<{ tenant_id: string }[]>`select tenant_id from agent_tasks`,
            ),
      ),
    )
    reads.forEach((rows, index) => {
      const expected = index % 2 === 0 ? tenantA : tenantB
      for (const row of rows) expect(row.tenant_id).toBe(expected)
    })
  })
})
