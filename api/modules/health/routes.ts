import { Elysia, t } from 'elysia'
import type { ReadinessGate } from '../../core/database/readiness'

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

/** Health boleh memicu verifikasi ulang paling cepat setiap 5 detik (endpoint publik). */
const HEALTH_MAX_AGE_MS = 5_000

/**
 * Health check publik: mencerminkan state gerbang kesiapan (konektivitas +
 * keamanan role/RLS). Hanya mengembalikan status ringkas — tanpa versi, host,
 * nama database, atau pesan error — agar tidak membocorkan detail infrastruktur.
 * Endpoint ini sendiri tidak ditahan gerbang (lihat http-plugin).
 */
export function healthRoutes(deps: { readiness: ReadinessGate }) {
  return new Elysia({ prefix: '/health', tags: ['System'] }).get(
    '',
    async ({ status }) => {
      const state = await deps.readiness.verify({ maxAgeMs: HEALTH_MAX_AGE_MS })
      const database: 'ok' | 'unavailable' | 'misconfigured' =
        state.status === 'ready' ? 'ok' : state.status === 'misconfigured' ? 'misconfigured' : 'unavailable'
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
        description:
          'Status layanan: konektivitas database dan verifikasi keamanan role/RLS. ' +
          'Mengembalikan 503 bila database tidak siap atau konfigurasinya tidak aman.',
      },
    },
  )
}
