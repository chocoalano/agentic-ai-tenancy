import { Elysia } from 'elysia'
import { guardPlugin } from '../../core/auth/guard'
import { clearSessionCookie, setSessionCookie } from '../../core/auth/session-cookie'
import type { ApiConfig } from '../../core/config/env'
import { ApiErrorSchema, protectedErrors, validationErrors } from '../../core/errors/schemas'
import { clientIpOf } from '../../core/http/client-ip'
import { requestIdOf, userAgentOf } from '../../core/http/request-context'
import { toPublicUser } from '../users/presenter'
import { LoginBody, LogoutResponse, MeResponse, RegisterBody, SessionResponse } from './schemas'
import type { AuthService, IssuedSession } from './service'

const SESSION_SECURITY = [{ sessionCookie: [] }]

function toSessionResponse(issued: IssuedSession) {
  return {
    user: toPublicUser(issued.user),
    session: { expiresAt: issued.expiresAt },
    activeTenantId: issued.activeTenantId,
  }
}

export function authRoutes(deps: { config: ApiConfig; auth: AuthService }) {
  const { config, auth } = deps

  return new Elysia({ prefix: '/auth', tags: ['Auth'] })
    .use(guardPlugin({ config, auth }))
    .post(
      '/register',
      async ({ body, cookie, request, server, status }) => {
        const issued = await auth.register(body, {
          userAgent: userAgentOf(request),
          requestId: requestIdOf(request),
          clientIp: clientIpOf(request, server),
        })
        setSessionCookie(cookie, config, issued.token, issued.expiresAt)
        return status(201, toSessionResponse(issued))
      },
      {
        body: RegisterBody,
        response: {
          201: SessionResponse,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          ...validationErrors,
        },
        detail: {
          summary: 'Registrasi pengguna',
          description:
            'Membuat akun baru dan langsung membuat sesi (cookie HttpOnly). Bila `companyName` diisi, ' +
            'perusahaan pertama dibuat dan pengguna menjadi owner.',
        },
      },
    )
    .post(
      '/login',
      async ({ body, cookie, request, server }) => {
        const issued = await auth.login(body, {
          userAgent: userAgentOf(request),
          requestId: requestIdOf(request),
          clientIp: clientIpOf(request, server),
        })
        setSessionCookie(cookie, config, issued.token, issued.expiresAt)
        return toSessionResponse(issued)
      },
      {
        body: LoginBody,
        response: {
          200: SessionResponse,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          429: ApiErrorSchema,
          ...validationErrors,
        },
        detail: {
          summary: 'Masuk',
          description:
            'Memverifikasi kredensial dan membuat sesi baru. Token sesi dikirim sebagai cookie HttpOnly, ' +
            'SameSite=Lax, Secure di production. Percobaan gagal berulang dibatasi (429).',
        },
      },
    )
    .post(
      '/logout',
      async ({ session, cookie }) => {
        const revoked = await auth.logout(session.sessionId)
        clearSessionCookie(cookie, config)
        return { revoked }
      },
      {
        auth: true,
        response: { 200: LogoutResponse, ...protectedErrors },
        detail: {
          summary: 'Keluar',
          description: 'Mencabut sesi saat ini di database dan menghapus cookie.',
          security: SESSION_SECURITY,
        },
      },
    )
    .get(
      '/me',
      async ({ session, request }) => {
        const tenant = await auth.activeTenantFor(session, requestIdOf(request))
        return {
          user: toPublicUser(session.user),
          session: { expiresAt: session.expiresAt },
          activeTenant: tenant
            ? {
                tenantId: tenant.tenantId,
                membershipId: tenant.membershipId,
                roles: tenant.userRoles,
                permissions: tenant.permissions,
              }
            : null,
        }
      },
      {
        auth: true,
        response: { 200: MeResponse, ...protectedErrors },
        detail: {
          summary: 'Pengguna saat ini',
          description: 'Profil pengguna, masa berlaku sesi, dan konteks tenant aktif yang telah diverifikasi.',
          security: SESSION_SECURITY,
        },
      },
    )
}
