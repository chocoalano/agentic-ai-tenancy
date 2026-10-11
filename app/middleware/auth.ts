/**
 * Melindungi halaman aplikasi. Status sesi selalu berasal dari backend
 * (`/api/v1/auth/me`); middleware ini hanya mengarahkan UI, otorisasi
 * sebenarnya ditegakkan di setiap endpoint API.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  await auth.ensureLoaded()
  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
