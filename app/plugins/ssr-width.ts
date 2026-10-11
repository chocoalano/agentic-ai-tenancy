import { provideSSRWidth } from '@vueuse/core'

/**
 * Lebar viewport asumsi saat SSR untuk media query VueUse (Sidebar shadcn-vue,
 * mode ringkas tablet di layouts/app.vue). Desktop adalah target utama,
 * sehingga SSR merender sidebar desktop terbuka; perangkat tablet/ponsel
 * menyesuaikan setelah mount (sidebar mobile disembunyikan via CSS `md:`).
 */
export default defineNuxtPlugin((nuxtApp) => {
  provideSSRWidth(1440, nuxtApp.vueApp)
})
