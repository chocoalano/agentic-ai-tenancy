/**
 * Shim kompatibilitas TIPE nuxt-elysia@1.0.0-beta.1 ↔ Nuxt 4.6.
 *
 * Template plugin nuxt-elysia (`.nuxt/nuxt-elysia/client-plugin.ts`)
 * mendeklarasikan `treatyConfig` lewat `declare module 'nuxt/schema'`. Pada
 * Nuxt 4.6, augmentasi melalui `'nuxt/schema'` tidak mengalir ke tipe
 * `useAppConfig()` (terverifikasi dengan probe vue-tsc), sehingga
 * `appConfig.treatyConfig` bertipe `unknown` dan `nuxt typecheck` gagal di
 * file hasil generate. Augmentasi `CustomAppConfig` milik `'@nuxt/schema'`
 * berfungsi dan merupakan cara Nuxt mendeklarasikan kunci app config kustom.
 *
 * Shim ini hanya memengaruhi tipe; perilaku runtime nuxt-elysia tidak berubah.
 * Hapus bila nuxt-elysia/Nuxt sudah memperbaikinya.
 */
import type { Treaty } from '@elysiajs/eden'

declare module '@nuxt/schema' {
  interface CustomAppConfig {
    /** Konfigurasi tambahan untuk `$api` (Eden Treaty) dari nuxt-elysia. */
    treatyConfig?: Treaty.Config
  }
}

export {}
