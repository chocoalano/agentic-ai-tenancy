/** Halaman login/registrasi tidak perlu ditampilkan bagi pengguna yang sudah masuk. */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  await auth.ensureLoaded()
  if (auth.isAuthenticated.value) {
    return navigateTo(safeRedirectPath(to.query.redirect))
  }
})
