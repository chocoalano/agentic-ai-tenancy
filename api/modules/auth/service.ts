import { randomUUID } from 'node:crypto'
import type { SQL } from 'bun'
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from '../../core/auth/password'
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from '../../core/auth/session-token'
import type { ApiConfig } from '../../core/config/env'
import { isUniqueViolation } from '../../core/database/errors'
import { enterTenantBootstrap, withTransaction, withUserTransaction } from '../../core/database/transactions'
import { AppError, errors } from '../../core/errors/app-error'
import type { LoginThrottle } from '../../core/security/login-throttle'
import { resolveTenantContext } from '../../core/tenancy/resolve-context'
import { membershipsRepository } from '../memberships/repository'
import { createTenantSlug } from '../tenants/service'
import { tenantsRepository } from '../tenants/repository'
import { usersRepository, type User } from '../users/repository'
import { sessionsRepository, type ActiveSession } from './session.repository'

const SESSION_TOUCH_INTERVAL_SECONDS = 300

export interface IssuedSession {
  user: User
  token: string
  expiresAt: Date
  activeTenantId: string | null
}

interface RequestMeta {
  userAgent: string | null
  requestId: string
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAuthService(deps: { sql: SQL; config: ApiConfig; throttle: LoginThrottle }) {
  const { sql, config, throttle } = deps

  function newSessionToken() {
    const token = generateSessionToken()
    return {
      token,
      tokenHash: hashSessionToken(token, config.session.secret),
      expiresAt: new Date(Date.now() + config.session.ttlHours * 3_600_000),
    }
  }

  return {
    /**
     * Mendaftarkan pengguna baru, opsional sekaligus membuat perusahaan
     * pertamanya (pengguna menjadi owner). Seluruh langkah atomik.
     */
    async register(
      input: { email: string; password: string; displayName: string; companyName?: string },
      meta: RequestMeta,
    ): Promise<IssuedSession> {
      const email = normalizeEmail(input.email)
      const passwordHash = await hashPassword(input.password)
      const issued = newSessionToken()
      try {
        return await withTransaction(sql, async (tx) => {
          const user = await usersRepository.create(tx, {
            email,
            displayName: input.displayName.trim(),
            passwordHash,
          })
          let activeTenantId: string | null = null
          const companyName = input.companyName?.trim()
          if (companyName) {
            const scope = await enterTenantBootstrap(tx, {
              tenantId: randomUUID(),
              userId: user.id,
              requestId: meta.requestId,
            })
            const { tenant } = await tenantsRepository.createWithOwner(scope, {
              name: companyName,
              slug: createTenantSlug(companyName),
            })
            activeTenantId = tenant.id
          }
          await sessionsRepository.create(tx, {
            userId: user.id,
            tokenHash: issued.tokenHash,
            expiresAt: issued.expiresAt,
            userAgent: meta.userAgent,
            activeTenantId,
          })
          return { user, token: issued.token, expiresAt: issued.expiresAt, activeTenantId }
        })
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_key')) {
          throw errors.conflict('EMAIL_ALREADY_REGISTERED', 'Email sudah terdaftar. Silakan masuk.')
        }
        throw error
      }
    },

    async login(input: { email: string; password: string }, meta: RequestMeta): Promise<IssuedSession> {
      const email = normalizeEmail(input.email)
      const retryAfter = throttle.retryAfterSeconds(email)
      if (retryAfter > 0) {
        throw errors.tooManyRequests('Terlalu banyak percobaan masuk. Coba lagi nanti.', {
          retryAfterSeconds: retryAfter,
        })
      }

      const credentials = await usersRepository.findCredentialsByEmail(sql, email)
      if (!credentials) {
        await verifyAgainstDummyHash(input.password)
        throttle.recordFailure(email)
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.')
      }
      const passwordValid = await verifyPassword(input.password, credentials.passwordHash)
      if (!passwordValid || credentials.status !== 'active') {
        throttle.recordFailure(email)
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.')
      }
      throttle.reset(email)

      // Tenant awal = keanggotaan aktif pertama; tetap divalidasi ulang di setiap request.
      const memberships = await withUserTransaction(sql, credentials.id, (scope) =>
        membershipsRepository.listForUser(scope),
      )
      const activeTenantId = memberships[0]?.tenant.id ?? null
      const issued = newSessionToken()
      await sessionsRepository.create(sql, {
        userId: credentials.id,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        userAgent: meta.userAgent,
        activeTenantId,
      })
      const user: User = {
        id: credentials.id,
        email: credentials.email,
        displayName: credentials.displayName,
        status: credentials.status,
        createdAt: credentials.createdAt,
      }
      return { user, token: issued.token, expiresAt: issued.expiresAt, activeTenantId }
    },

    /** Memvalidasi token cookie terhadap tabel sessions. Tidak pernah mempercayai ID dari klien. */
    async authenticate(token: unknown): Promise<ActiveSession | null> {
      if (!isWellFormedSessionToken(token)) return null
      const session = await sessionsRepository.findActiveByTokenHash(
        sql,
        hashSessionToken(token, config.session.secret),
      )
      if (!session) return null
      if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_SECONDS * 1000) {
        await sessionsRepository.touch(sql, session.sessionId, SESSION_TOUCH_INTERVAL_SECONDS)
      }
      return session
    },

    async logout(sessionId: string): Promise<boolean> {
      return sessionsRepository.revoke(sql, sessionId)
    },

    /**
     * Konteks tenant aktif untuk sesi. Bila keanggotaan sudah dicabut,
     * pilihan tenant di sesi dikosongkan dan `null` dikembalikan.
     */
    async activeTenantFor(session: ActiveSession, requestId: string) {
      if (!session.activeTenantId) return null
      const context = await resolveTenantContext(sql, {
        userId: session.user.id,
        tenantId: session.activeTenantId,
        requestId,
      })
      if (!context) {
        await sessionsRepository.setActiveTenant(sql, session.sessionId, null)
        return null
      }
      return context
    },
  }
}

export type AuthService = ReturnType<typeof createAuthService>
