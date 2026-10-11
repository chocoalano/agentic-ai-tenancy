/**
 * Entry point nuxt-elysia (`nuxtElysia.module` default: `~~/api`).
 *
 * nuxt-elysia memanggil factory ini sekali saat server Nitro start, lalu
 * me-mount aplikasi di `/api` dan menyediakan klien Eden Treaty `$api` yang
 * tipenya diinferensi dari nilai kembalian factory ini.
 *
 * Factory sengaja SINKRON: Nitro 2 tidak menunggu plugin async, sehingga I/O
 * di sini akan membuka jendela waktu di mana request pertama tidak menemukan
 * aplikasi Elysia. Verifikasi database berjalan lewat gerbang kesiapan yang
 * dibuat `createApi` (fail-closed: request tenant ditolak 503 sampai verifikasi
 * berhasil, lihat core/database/readiness.ts). Konfigurasi tetap divalidasi
 * sinkron — env tidak valid menggagalkan start.
 *
 * Jangan memanggil `.listen()` di sini.
 */
import { createApi } from './app'
import { loadApiConfig } from './core/config/env'
import { createDependencies, createReadinessGate } from './container'
import { createExecutionWorker } from './modules/runs/worker'

export default function createElysiaApp() {
  const config = loadApiConfig()
  const deps = createDependencies({ config })
  const readiness = createReadinessGate(deps)
  if (config.worker.inline) {
    // Worker in-process (instance tunggal/pengembangan): mulai hanya setelah database & role terverifikasi.
    const worker = createExecutionWorker(deps)
    void readiness.waitUntilReady().then(
      () => worker.start(),
      (error) => deps.logger.error('Worker inline tidak dimulai: database belum siap', { error: String(error) }),
    )
    const shutdown = () => {
      void worker.stop()
      deps.realtimeHub.stop()
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  }
  return createApi(deps, { readiness })
}
