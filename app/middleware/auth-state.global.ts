/**
 * Memuat state sesi sekali per kunjungan (SSR atau navigasi pertama) agar
 * seluruh halaman — termasuk halaman publik — mengetahui status login.
 * Tanpa cookie sesi, backend langsung menjawab 401 tanpa query database.
 */
export default defineNuxtRouteMiddleware(async () => {
  await useAuth().ensureLoaded()
})
