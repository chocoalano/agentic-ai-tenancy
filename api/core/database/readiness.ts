import type { SQL } from 'bun'
import { AppError } from '../errors/app-error'
import type { Logger } from '../http/logger'
import { normalizeDatabaseError } from './errors'
import { describeRuntimeRoleProblems, inspectRuntimeRole, type RuntimeRoleReport } from './safety'

/*
 * Gerbang kesiapan database (fail-closed).
 *
 * Request tenant-scoped TIDAK PERNAH dilayani sebelum verifikasi keamanan
 * database berhasil: database terjangkau, role runtime bukan superuser, tanpa
 * BYPASSRLS, bukan pemilik tabel tenant, dan semua tabel tenant memakai
 * FORCE ROW LEVEL SECURITY (lihat safety.ts).
 *
 * - Verifikasi pertama dimulai saat gerbang dibuat; request yang datang lebih
 *   dulu menunggu hasil yang sama (satu pemeriksaan dibagi semua pemanggil).
 * - Database tidak terjangkau → 503 DATABASE_UNAVAILABLE; dicoba ulang paling
 *   cepat setiap `retryIntervalMs` sehingga layanan pulih sendiri saat database
 *   kembali, tanpa membanjiri database.
 * - Role/RLS tidak aman (atau pemeriksaan gagal karena sebab lain) → 503
 *   SERVICE_MISCONFIGURED; diperiksa ulang setiap `recheckIntervalMs` agar
 *   perbaikan oleh DBA ikut terdeteksi tanpa restart.
 * - Setelah siap, verifikasi diulang setiap `recheckIntervalMs` (role dapat
 *   berubah saat runtime, mis. failover ke server lain).
 *
 * Kegagalan konektivitas tidak pernah dianggap "lulus".
 */

export type ReadinessStatus = 'pending' | 'ready' | 'unavailable' | 'misconfigured'

export interface ReadinessState {
  status: ReadinessStatus
  /** Epoch ms pemeriksaan terakhir; null bila belum pernah selesai. */
  checkedAt: number | null
  /** Jumlah pemeriksaan yang sudah dijalankan. */
  attempts: number
  /** Alasan tidak siap (hanya untuk log/operator — tidak dikirim ke klien). */
  problems: string[]
}

export interface ReadinessGate {
  /** Menahan request sampai verifikasi berhasil; melempar AppError 503 bila tidak siap. */
  waitUntilReady(): Promise<void>
  /** State terakhir tanpa memicu pemeriksaan. */
  state(): ReadinessState
  /**
   * Menjalankan pemeriksaan bila hasil terakhir sudah lebih tua dari `maxAgeMs`
   * (default: tergantung status) atau `force`. Pemanggil paralel berbagi satu
   * pemeriksaan yang sedang berjalan.
   */
  verify(options?: { force?: boolean; maxAgeMs?: number }): Promise<ReadinessState>
}

export interface ReadinessOptions {
  /** Pemeriksa role database; dapat diganti pada test. */
  inspect?: (sql: SQL) => Promise<RuntimeRoleReport>
  /** Jeda minimum pemeriksaan ulang setelah siap/misconfigured (default 60 dtk). */
  recheckIntervalMs?: number
  /** Jeda minimum percobaan ulang saat database tidak terjangkau (default 2 dtk). */
  retryIntervalMs?: number
  now?: () => number
}

const DEFAULT_RECHECK_INTERVAL_MS = 60_000
const DEFAULT_RETRY_INTERVAL_MS = 2_000

export function createReadinessGate(deps: { sql: SQL; logger: Logger }, options: ReadinessOptions = {}): ReadinessGate {
  const inspect = options.inspect ?? inspectRuntimeRole
  const recheckIntervalMs = options.recheckIntervalMs ?? DEFAULT_RECHECK_INTERVAL_MS
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS
  const now = options.now ?? Date.now

  let current: ReadinessState = { status: 'pending', checkedAt: null, attempts: 0, problems: [] }
  let inFlight: Promise<ReadinessState> | null = null
  let lastLogged: ReadinessStatus = 'pending'

  function intervalFor(status: ReadinessStatus): number {
    return status === 'unavailable' ? retryIntervalMs : recheckIntervalMs
  }

  function isStale(maxAgeMs?: number): boolean {
    if (current.status === 'pending' || current.checkedAt === null) return true
    return now() - current.checkedAt >= (maxAgeMs ?? intervalFor(current.status))
  }

  function log(next: ReadinessState) {
    if (next.status === lastLogged) return
    lastLogged = next.status
    if (next.status === 'ready') {
      deps.logger.info('Verifikasi keamanan database berhasil; API siap melayani request', {
        attempts: next.attempts,
      })
    } else if (next.status === 'unavailable') {
      deps.logger.warn('Database belum dapat dihubungi; API menahan request tenant (503) sampai verifikasi berhasil', {
        attempts: next.attempts,
        retryIntervalMs,
        problems: next.problems,
      })
    } else {
      deps.logger.error('API ditahan (503): konfigurasi database tidak aman untuk multi-tenancy', {
        attempts: next.attempts,
        problems: next.problems,
      })
    }
  }

  async function run(): Promise<ReadinessState> {
    const attempts = current.attempts + 1
    let next: ReadinessState
    try {
      const problems = describeRuntimeRoleProblems(await inspect(deps.sql))
      next = {
        status: problems.length === 0 ? 'ready' : 'misconfigured',
        checkedAt: now(),
        attempts,
        problems,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Hanya error konektivitas yang dianggap sementara; error lain (izin katalog,
      // query) berarti konfigurasi salah dan tetap menutup gerbang.
      const transient = normalizeDatabaseError(error)?.code === 'DATABASE_UNAVAILABLE'
      next = {
        status: transient ? 'unavailable' : 'misconfigured',
        checkedAt: now(),
        attempts,
        problems: [transient ? `database tidak terjangkau: ${message}` : `pemeriksaan keamanan gagal: ${message}`],
      }
    }
    current = next
    log(next)
    return next
  }

  function verify(options: { force?: boolean; maxAgeMs?: number } = {}): Promise<ReadinessState> {
    if (inFlight) return inFlight
    if (!options.force && !isStale(options.maxAgeMs)) return Promise.resolve(current)
    inFlight = run().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function waitUntilReady(): Promise<void> {
    const state = await verify()
    if (state.status === 'ready') return
    if (state.status === 'unavailable') {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database sedang tidak tersedia.', {
        retryAfterSeconds: Math.max(1, Math.ceil(retryIntervalMs / 1000)),
      })
    }
    throw new AppError(503, 'SERVICE_MISCONFIGURED', 'Layanan belum siap. Hubungi administrator.')
  }

  // Mulai verifikasi segera agar request pertama tidak menunggu lebih lama dari perlu.
  void verify()

  return { waitUntilReady, state: () => current, verify }
}
