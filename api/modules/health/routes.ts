import type { SQL } from 'bun'
import { Elysia, t } from 'elysia'
import { describeRuntimeRoleProblems, inspectRuntimeRole } from '../../core/database/safety'
import type { Logger } from '../../core/http/logger'

const HealthSchema = t.Object(
  {
    status: t.UnionEnum(['ok', 'degraded']),
    time: t.Date(),
    checks: t.Object({
      database: t.UnionEnum(['ok', 'unavailable', 'misconfigured']),
    }),
  },
  { title: 'Health' },
)

const ROLE_CHECK_TTL_MS = 60_000

/**
 * Health check publik. Hanya mengembalikan status ringkas — tanpa versi,
 * host, nama database, atau pesan error — agar tidak membocorkan detail
 * infrastruktur.
 */
export function healthRoutes(deps: { sql: SQL; logger: Logger }) {
  let roleCheck: { ok: boolean; checkedAt: number } | undefined

  async function databaseStatus(): Promise<'ok' | 'unavailable' | 'misconfigured'> {
    try {
      await deps.sql`select 1`
    } catch {
      return 'unavailable'
    }
    if (!roleCheck || Date.now() - roleCheck.checkedAt > ROLE_CHECK_TTL_MS) {
      try {
        const problems = describeRuntimeRoleProblems(await inspectRuntimeRole(deps.sql))
        if (problems.length > 0) deps.logger.error('Role database runtime tidak aman', { problems })
        roleCheck = { ok: problems.length === 0, checkedAt: Date.now() }
      } catch {
        return 'unavailable'
      }
    }
    return roleCheck.ok ? 'ok' : 'misconfigured'
  }

  return new Elysia({ prefix: '/health', tags: ['System'] }).get(
    '',
    async ({ status }) => {
      const database = await databaseStatus()
      const result = {
        status: database === 'ok' ? ('ok' as const) : ('degraded' as const),
        time: new Date(),
        checks: { database },
      }
      return database === 'ok' ? result : status(503, result)
    },
    {
      response: { 200: HealthSchema, 503: HealthSchema },
      detail: {
        summary: 'Health check',
        description: 'Status layanan dan konektivitas database. Mengembalikan 503 bila database tidak siap.',
      },
    },
  )
}
