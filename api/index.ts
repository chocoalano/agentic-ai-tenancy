/**
 * Entry point nuxt-elysia (`nuxtElysia.module` default: `~~/api`).
 *
 * nuxt-elysia memanggil factory ini sekali saat server Nitro start, lalu
 * me-mount aplikasi di `/api` dan menyediakan klien Eden Treaty `$api` yang
 * tipenya diinferensi dari nilai kembalian factory ini.
 *
 * Factory sengaja SINKRON: Nitro 2 tidak menunggu plugin async, sehingga I/O
 * di sini akan membuka jendela waktu di mana request pertama tidak menemukan
 * aplikasi Elysia. Verifikasi database berjalan lewat readiness gate.
 * Konfigurasi tetap divalidasi sinkron — env tidak valid menggagalkan start.
 *
 * Jangan memanggil `.listen()` di sini.
 */
import { createApi } from './app'
import { loadApiConfig } from './core/config/env'
import { createDependencies, createReadinessGate } from './container'

export default function createElysiaApp() {
  const config = loadApiConfig()
  const deps = createDependencies({ config })
  return createApi(deps, { waitUntilReady: createReadinessGate(deps) })
}
