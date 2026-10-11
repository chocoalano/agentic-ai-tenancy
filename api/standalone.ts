/**
 * Menjalankan API yang sama sebagai server Bun/Elysia mandiri, tanpa Nuxt.
 *
 *   bun run api:standalone   → http://localhost:4000/v1/health
 *
 * Membuktikan bahwa domain logic tidak terikat pada Nuxt/Nitro dan menjadi
 * dasar ekstraksi layanan (mis. gateway WebSocket realtime) di masa depan.
 */
import { createApi } from './app'
import { loadApiConfig } from './core/config/env'
import { createDependencies, verifyDatabaseOnStartup } from './container'

const config = loadApiConfig()
const deps = createDependencies({ config })
await verifyDatabaseOnStartup(deps)

const port = Number(process.env.API_STANDALONE_PORT ?? 4000)
const app = createApi(deps).listen(port)
deps.logger.info(`API standalone berjalan di http://localhost:${app.server?.port ?? port}/v1/health`)
