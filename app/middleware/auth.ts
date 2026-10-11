/**
 * Melindungi halaman aplikasi. Status sesi selalu berasal dari backend
 * (`/api/v1/auth/me`); middleware ini hanya mengarahkan UI, otorisasi
 * sebenarnya ditegakkan di setiap endpoint API.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  await auth.ensureLoaded()
  // Backend tidak tersedia: jangan berpura-pura "belum login" (redirect), tampilkan 503 yang jujur.
  if (auth.loadFailure.value) {
    throw createError({
      statusCode: 503,
      statusMessage: 'SERVICE_UNAVAILABLE',
      message: 'Layanan sementara tidak tersedia. Coba lagi beberapa saat.',
    })
  }
  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
