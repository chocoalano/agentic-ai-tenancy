/**
 * Menjalankan API yang sama sebagai server Bun/Elysia mandiri, tanpa Nuxt.
 *
 *   bun run api:standalone   → http://localhost:4000/v1/health
 *
 * Membuktikan bahwa domain logic tidak terikat pada Nuxt/Nitro dan menjadi
 * dasar ekstraksi layanan (mis. gateway WebSocket realtime) di masa depan.
 *
 * Gerbang kesiapan yang sama dengan mode mount dipakai di sini (fail-closed):
 * - role/RLS tidak aman saat start → proses berhenti dengan kode 1 (supervisor
 *   dapat memulai ulang setelah konfigurasi diperbaiki);
 * - database belum terjangkau → server tetap berjalan, request tenant dijawab
 *   503 dan verifikasi diulang sampai berhasil;
 * - siap → melayani seperti biasa.
 */
import { createApi } from './app'
import { loadApiConfig } from './core/config/env'
import { createDependencies, createReadinessGate } from './container'

const config = loadApiConfig()
const deps = createDependencies({ config })
const readiness = createReadinessGate(deps)

const initial = await readiness.verify({ force: true })
if (initial.status === 'misconfigured') {
  deps.logger.error('API standalone berhenti: konfigurasi database tidak aman', { problems: initial.problems })
  process.exit(1)
}
if (initial.status !== 'ready') {
  deps.logger.warn('API standalone berjalan tanpa database; request tenant dijawab 503 sampai verifikasi berhasil')
}

const app = createApi(deps, { readiness }).listen(config.standalone.port)
deps.logger.info(`API standalone berjalan di http://localhost:${app.server?.port ?? config.standalone.port}/v1/health`)
