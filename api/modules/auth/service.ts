import { randomUUID } from 'node:crypto'
import type { SQL } from 'bun'
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from '../../core/auth/password'
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from '../../core/auth/session-token'
import type { ApiConfig } from '../../core/config/env'
import { isUniqueViolation } from '../../core/database/errors'
import { enterTenantBootstrap, withTransaction, withUserTransaction } from '../../core/database/transactions'
import { AppError, errors } from '../../core/errors/app-error'
import type { RateLimiter } from '../../core/security/rate-limiter'
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
  /** IP klien yang ditentukan server; '' bila tidak diketahui (pembatasan per IP dilewati). */
  clientIp: string
}

/** Pembatas laju untuk alur autentikasi (lihat core/security/rate-limiter.ts). */
export interface AuthRateLimits {
  /** Percobaan masuk per email (dihitung SEBELUM verifikasi; sukses mereset). */
  loginEmail: RateLimiter
  /** Percobaan masuk per IP, apa pun emailnya (menahan password spraying). */
  loginIp: RateLimiter
  /** Registrasi per IP (setiap registrasi menjalankan Argon2). */
  registerIp: RateLimiter
}

function enforce(limiter: RateLimiter, key: string, message: string) {
  if (!key) return
  const decision = limiter.consume(key)
  if (!decision.allowed) {
    throw errors.tooManyRequests(message, { retryAfterSeconds: decision.retryAfterSeconds })
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAuthService(deps: { sql: SQL; config: ApiConfig; limits: AuthRateLimits }) {
  const { sql, config, limits } = deps

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
      // Dibatasi per IP sebelum pekerjaan mahal (hash Argon2) — tanpa IP (tidak diketahui) dilewati.
      enforce(limits.registerIp, meta.clientIp, 'Terlalu banyak registrasi dari alamat ini. Coba lagi nanti.')
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
      // Keduanya dihitung ATOMIK sebelum verifikasi (bukan periksa-lalu-await-lalu-catat), sehingga
      // request paralel tidak bisa melampaui batas: per IP (spraying banyak email) dan per email.
      enforce(limits.loginIp, meta.clientIp, 'Terlalu banyak percobaan masuk dari alamat ini. Coba lagi nanti.')
      enforce(limits.loginEmail, email, 'Terlalu banyak percobaan masuk. Coba lagi nanti.')

      const credentials = await usersRepository.findCredentialsByEmail(sql, email)
      if (!credentials) {
        await verifyAgainstDummyHash(input.password)
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.')
      }
      const passwordValid = await verifyPassword(input.password, credentials.passwordHash)
      if (!passwordValid || credentials.status !== 'active') {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.')
      }
      // Sukses: hitungan per email direset (bukan per IP — kuota IP tetap berjalan).
      limits.loginEmail.reset(email)

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
