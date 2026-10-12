import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import type { NuxtModule } from 'nuxt/schema'

/**
 * Halaman harness khusus pengembangan (kalibrasi visual dunia /office).
 * Hanya didaftarkan saat `nuxt dev` (`nuxt.options.dev`); pada `nuxt build`
 * hook ini tidak dipasang sehingga halaman tidak pernah ada di manifest route
 * production (diverifikasi tests/e2e/production.test.ts). File halamannya
 * sengaja di luar app/pages agar tidak dipindai sebagai route biasa.
 */
const devOnlyPages: NuxtModule = (_options, nuxt) => {
  if (!nuxt.options.dev) return
  nuxt.hook('pages:extend', (pages) => {
    pages.push({
      name: 'dev-office-visual-qa',
      path: '/__dev/office-visual-qa',
      file: fileURLToPath(new URL('./app/dev/office-visual-qa.vue', import.meta.url)),
    })
  })
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['nuxt-elysia', 'shadcn-nuxt', '@nuxtjs/color-mode', '@nuxt/eslint', devOnlyPages],

  css: ['~/assets/css/tailwind.css', 'vue-sonner/style.css'],

  // Komponen domain di-auto-import tanpa prefix folder (AppSidebar, AgentCard, ...).
  // Primitive UI di components/ui didaftarkan oleh shadcn-nuxt.
  components: [
    { path: '~/components/app', pathPrefix: false },
    { path: '~/components/office', pathPrefix: false },
    { path: '~/components/agents', pathPrefix: false },
    { path: '~/components/shared', pathPrefix: false },
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  // Elysia di-mount di /api; route bisnis berversi di /api/v1/*.
  // `$api` (Eden Treaty) disediakan oleh nuxt-elysia dan meneruskan header
  // Cookie saat SSR sehingga sesi pengguna ikut terbawa.
  nuxtElysia: {
    module: '~~/api',
    path: '/api',
    treaty: true,
    treatyRequestHeaders: ['Cookie'],
  },

  // Elysia memakai export khusus Bun; production wajib memakai preset Bun.
  nitro: {
    preset: 'bun',
  },

  shadcn: {
    prefix: '',
    componentDir: '~/components/ui',
  },

  // Tema gelap premium sebagai default; kelas `.dark` di <html>.
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
    storageKey: 'aivo-color-mode',
  },

  // Hanya nilai publik. Secret server (DB_PASSWORD/DATABASE_URL, SESSION_SECRET) dibaca
  // langsung oleh modul API dari process.env dan tidak pernah masuk ke sini.
  runtimeConfig: {
    public: {
      appName: 'Agentic AI Virtual Office',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      titleTemplate: '%s · Agentic AI Virtual Office',
      meta: [{ name: 'description', content: 'Kantor virtual untuk AI digital employee perusahaan Anda.' }],
    },
  },

  // Halaman ter-autentikasi dirender per request dengan cookie pengguna;
  // larang cache bersama (CDN/proxy) agar data tenant tidak bocor.
  routeRules: {
    '/office/**': { headers: { 'cache-control': 'private, no-store' } },
    '/agents/**': { headers: { 'cache-control': 'private, no-store' } },
    '/settings/**': { headers: { 'cache-control': 'private, no-store' } },
    '/tasks/**': { headers: { 'cache-control': 'private, no-store' } },
    '/**': {
      headers: {
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-frame-options': 'DENY',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
  },

  typescript: {
    strict: true,
  },
})
