import { CLIENT_IP_HEADER } from '~~/domains/security/client-ip'

/**
 * Menyematkan alamat IP klien ke header internal untuk API Elysia yang
 * di-mount (lihat domains/security/client-ip.ts). Nilai dari klien tidak
 * pernah dipercaya: header selalu ditimpa. `x-forwarded-for` hanya dipakai bila
 * TRUSTED_PROXY=true (aplikasi di belakang reverse proxy yang menyetelnya).
 */
export default defineEventHandler((event) => {
  const trustProxy = process.env.TRUSTED_PROXY === 'true'
  const address = getRequestIP(event, { xForwardedFor: trustProxy }) ?? ''
  event.node.req.headers[CLIENT_IP_HEADER] = address
})
