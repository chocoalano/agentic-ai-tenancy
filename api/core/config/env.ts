/**
 * Konfigurasi server-side untuk Elysia API.
 *
 * Konfigurasi dibaca langsung dari `process.env` (bukan dari Nuxt
 * runtimeConfig) agar modul backend dapat diekstrak menjadi layanan Bun/Elysia
 * mandiri tanpa perubahan. Nilai ini TIDAK PERNAH dikirim ke browser.
 */

export type NodeEnv = 'development' | 'test' | 'production'

export interface ApiConfig {
  nodeEnv: NodeEnv
  isProduction: boolean
  database: {
    url: string
    poolMax: number
    idleTimeoutSeconds: number
    connectionTimeoutSeconds: number
  }
  session: {
    secret: string
    ttlHours: number
    cookieName: string
    cookieSecure: boolean
  }
  security: {
    /** Origin tambahan yang dipercaya untuk request mutasi (selain origin dari header Host). */
    trustedOrigins: string[]
    loginMaxFailures: number
    loginWindowMinutes: number
    /** Pembatasan laju per alamat IP / pengguna (fixed window). */
    rateLimit: {
      loginPerIp: { max: number; windowMinutes: number }
      registerPerIp: { max: number; windowMinutes: number }
      tenantCreatePerUser: { max: number; windowMinutes: number }
      taskCreatePerUser: { max: number; windowMinutes: number }
    }
  }
  openapi: {
    enabled: boolean
  }
  realtime: {
    heartbeatIntervalMs: number
    /** Interval validasi ulang sesi/keanggotaan/izin pada stream SSE yang hidup lama. */
    revalidateIntervalMs: number
    /** Interval polling outbox oleh dispatcher SSE (hanya saat ada koneksi). */
    outboxPollMs: number
    /** Retensi outbox (jam); replay Last-Event-ID hanya dijamin di dalam retensi. */
    outboxRetentionHours: number
  }
  /** AI Runtime (server-side saja; tidak pernah dikirim ke browser). */
  ai: {
    provider: AiProvider
    baseUrl: string
    apiKey: string
    model: string
    timeoutSeconds: number
    maxInstructionChars: number
    maxOutputChars: number
    maxOutputTokens: number
    temperature: number
  }
  worker: {
    /** Jalankan loop worker di dalam proses server (instance tunggal/dev). Default: false. */
    inline: boolean
    workerId: string
    concurrency: number
    pollMs: number
    leaseSeconds: number
    maxAttempts: number
    /** Batas run aktif per tenant dan per hari (pengaman biaya; bukan anggaran moneter). */
    tenantMaxActiveRuns: number
    tenantDailyRunLimit: number
  }
  approvals: {
    ttlHours: number
    /** Pembuat tugas tidak boleh memutuskan persetujuan tugasnya sendiri. */
    forbidSelfDecision: boolean
  }
  standalone: {
    /** Port server Bun/Elysia mandiri (`bun run api:standalone`). */
    port: number
  }
}

export const AI_PROVIDERS = ['none', 'openai-compatible', 'fixture'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Konfigurasi server tidak valid:\n- ${issues.join('\n- ')}`)
    this.name = 'ConfigError'
  }
}

const PLACEHOLDER_SECRETS = new Set(['replace-with-strong-random-secret', 'changeme', 'secret'])

type Env = Record<string, string | undefined>

function readNodeEnv(env: Env, issues: string[]): NodeEnv {
  const value = env.NODE_ENV ?? 'development'
  if (value === 'development' || value === 'test' || value === 'production') return value
  issues.push(`NODE_ENV harus development, test, atau production (diterima: "${value}")`)
  return 'development'
}

function readInt(env: Env, key: string, fallback: number, min: number, max: number, issues: string[]): number {
  const raw = env[key]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push(`${key} harus bilangan bulat antara ${min} dan ${max}`)
    return fallback
  }
  return value
}

function readBool(env: Env, key: string, fallback: boolean, issues: string[]): boolean {
  const raw = env[key]
  if (raw === undefined || raw === '') return fallback
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  issues.push(`${key} harus bernilai true atau false`)
  return fallback
}

function readNumber(env: Env, key: string, fallback: number, min: number, max: number, issues: string[]): number {
  const raw = env[key]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) {
    issues.push(`${key} harus angka antara ${min} dan ${max}`)
    return fallback
  }
  return value
}

function readAiProvider(env: Env, isProduction: boolean, issues: string[]): AiProvider {
  const raw = env.AI_RUNTIME_PROVIDER ?? 'none'
  if (!(AI_PROVIDERS as readonly string[]).includes(raw)) {
    issues.push(`AI_RUNTIME_PROVIDER harus salah satu dari: ${AI_PROVIDERS.join(', ')} (diterima: "${raw}")`)
    return 'none'
  }
  const provider = raw as AiProvider
  // Adapter fixture deterministik hanya untuk test/pengembangan: production fail-closed.
  if (provider === 'fixture' && isProduction) {
    issues.push('AI_RUNTIME_PROVIDER=fixture tidak diizinkan di production (bukan runtime AI sungguhan)')
    return 'none'
  }
  return provider
}

function readOrigins(env: Env, issues: string[]): string[] {
  const raw = env.APP_TRUSTED_ORIGINS
  if (!raw) return []
  const origins: string[] = []
  for (const part of raw.split(',')) {
    const candidate = part.trim()
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (url.origin !== candidate.replace(/\/$/, '')) throw new Error('bukan origin murni')
      origins.push(url.origin)
    } catch {
      issues.push(`APP_TRUSTED_ORIGINS berisi origin tidak valid: "${candidate}"`)
    }
  }
  return origins
}

export function loadApiConfig(env: Env = process.env): ApiConfig {
  const issues: string[] = []
  const nodeEnv = readNodeEnv(env, issues)
  const isProduction = nodeEnv === 'production'

  const databaseUrl = env.DATABASE_URL ?? ''
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    issues.push('DATABASE_URL wajib diisi dengan URL PostgreSQL (postgresql://...)')
  }

  const secret = env.SESSION_SECRET ?? ''
  if (secret.length < 32) {
    issues.push('SESSION_SECRET wajib diisi minimal 32 karakter (lihat docs/setup.md untuk cara membuatnya)')
  } else if (PLACEHOLDER_SECRETS.has(secret)) {
    issues.push('SESSION_SECRET masih memakai nilai contoh; buat secret acak yang baru')
  }

  const cookieSecure = isProduction ? true : readBool(env, 'SESSION_COOKIE_SECURE', false, issues)

  const config: ApiConfig = {
    nodeEnv,
    isProduction,
    database: {
      url: databaseUrl,
      poolMax: readInt(env, 'DATABASE_POOL_MAX', 10, 1, 100, issues),
      idleTimeoutSeconds: readInt(env, 'DATABASE_IDLE_TIMEOUT_SECONDS', 30, 1, 3600, issues),
      connectionTimeoutSeconds: readInt(env, 'DATABASE_CONNECT_TIMEOUT_SECONDS', 10, 1, 120, issues),
    },
    session: {
      secret,
      ttlHours: readInt(env, 'SESSION_TTL_HOURS', 168, 1, 24 * 90, issues),
      // Prefix __Host- memaksa Secure, Path=/ dan tanpa Domain; hanya bisa dipakai lewat HTTPS.
      cookieName: cookieSecure ? '__Host-aivo_session' : 'aivo_session',
      cookieSecure,
    },
    security: {
      trustedOrigins: readOrigins(env, issues),
      loginMaxFailures: readInt(env, 'AUTH_LOGIN_MAX_FAILURES', 5, 1, 100, issues),
      loginWindowMinutes: readInt(env, 'AUTH_LOGIN_WINDOW_MINUTES', 15, 1, 24 * 60, issues),
      rateLimit: {
        loginPerIp: {
          max: readInt(env, 'RATE_LIMIT_LOGIN_IP_MAX', 30, 1, 10_000, issues),
          windowMinutes: readInt(env, 'RATE_LIMIT_LOGIN_IP_WINDOW_MINUTES', 15, 1, 24 * 60, issues),
        },
        registerPerIp: {
          max: readInt(env, 'RATE_LIMIT_REGISTER_IP_MAX', 10, 1, 10_000, issues),
          windowMinutes: readInt(env, 'RATE_LIMIT_REGISTER_IP_WINDOW_MINUTES', 60, 1, 24 * 60, issues),
        },
        tenantCreatePerUser: {
          max: readInt(env, 'RATE_LIMIT_TENANT_CREATE_MAX', 10, 1, 10_000, issues),
          windowMinutes: readInt(env, 'RATE_LIMIT_TENANT_CREATE_WINDOW_MINUTES', 60, 1, 24 * 60, issues),
        },
        taskCreatePerUser: {
          max: readInt(env, 'RATE_LIMIT_TASK_CREATE_MAX', 30, 1, 10_000, issues),
          windowMinutes: readInt(env, 'RATE_LIMIT_TASK_CREATE_WINDOW_MINUTES', 15, 1, 24 * 60, issues),
        },
      },
    },
    openapi: {
      // Dokumentasi interaktif (Scalar) mati secara default di production; nyalakan eksplisit bila perlu.
      enabled: readBool(env, 'OPENAPI_ENABLED', !isProduction, issues),
    },
    realtime: {
      heartbeatIntervalMs: readInt(env, 'REALTIME_HEARTBEAT_MS', 5_000, 1_000, 120_000, issues),
      revalidateIntervalMs: readInt(env, 'REALTIME_REVALIDATE_MS', 15_000, 50, 300_000, issues),
      outboxPollMs: readInt(env, 'REALTIME_OUTBOX_POLL_MS', 1_000, 20, 60_000, issues),
      outboxRetentionHours: readInt(env, 'REALTIME_OUTBOX_RETENTION_HOURS', 24, 1, 720, issues),
    },
    ai: {
      provider: readAiProvider(env, isProduction, issues),
      baseUrl: (env.AI_RUNTIME_BASE_URL ?? '').replace(/\/+$/, ''),
      apiKey: env.AI_RUNTIME_API_KEY ?? '',
      model: env.AI_RUNTIME_MODEL ?? '',
      timeoutSeconds: readInt(env, 'AI_RUNTIME_TIMEOUT_SECONDS', 120, 5, 900, issues),
      maxInstructionChars: readInt(env, 'AI_MAX_INSTRUCTION_CHARS', 4_000, 50, 8_000, issues),
      maxOutputChars: readInt(env, 'AI_MAX_OUTPUT_CHARS', 20_000, 200, 200_000, issues),
      maxOutputTokens: readInt(env, 'AI_MAX_OUTPUT_TOKENS', 1_024, 16, 32_000, issues),
      temperature: readNumber(env, 'AI_RUNTIME_TEMPERATURE', 0.2, 0, 2, issues),
    },
    worker: {
      inline: readBool(env, 'AI_WORKER_INLINE', false, issues),
      workerId: env.AI_WORKER_ID?.trim() || `${env.HOSTNAME ?? 'worker'}-${process.pid}`,
      concurrency: readInt(env, 'AI_WORKER_CONCURRENCY', 2, 1, 32, issues),
      pollMs: readInt(env, 'AI_WORKER_POLL_MS', 1_000, 20, 60_000, issues),
      leaseSeconds: readInt(env, 'AI_RUN_LEASE_SECONDS', 60, 5, 3_600, issues),
      maxAttempts: readInt(env, 'AI_RUN_MAX_ATTEMPTS', 3, 1, 10, issues),
      tenantMaxActiveRuns: readInt(env, 'AI_TENANT_MAX_ACTIVE_RUNS', 3, 1, 1_000, issues),
      tenantDailyRunLimit: readInt(env, 'AI_TENANT_DAILY_RUN_LIMIT', 100, 1, 100_000, issues),
    },
    approvals: {
      ttlHours: readInt(env, 'APPROVAL_TTL_HOURS', 24, 1, 24 * 30, issues),
      forbidSelfDecision: readBool(env, 'APPROVAL_FORBID_SELF', false, issues),
    },
    standalone: {
      port: readInt(env, 'API_STANDALONE_PORT', 4000, 1, 65535, issues),
    },
  }

  if (config.ai.provider === 'openai-compatible') {
    if (
      !/^https:\/\//.test(config.ai.baseUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(config.ai.baseUrl)
    ) {
      issues.push(
        'AI_RUNTIME_BASE_URL wajib URL https (atau http://localhost untuk pengembangan) bila AI_RUNTIME_PROVIDER=openai-compatible',
      )
    }
    if (config.ai.apiKey.length < 8)
      issues.push('AI_RUNTIME_API_KEY wajib diisi bila AI_RUNTIME_PROVIDER=openai-compatible')
    if (!config.ai.model) issues.push('AI_RUNTIME_MODEL wajib diisi bila AI_RUNTIME_PROVIDER=openai-compatible')
  }
  if (config.ai.maxOutputChars < config.ai.maxInstructionChars) {
    issues.push('AI_MAX_OUTPUT_CHARS tidak boleh lebih kecil dari AI_MAX_INSTRUCTION_CHARS')
  }
  if (config.worker.leaseSeconds <= config.worker.pollMs / 1000) {
    issues.push('AI_RUN_LEASE_SECONDS harus lebih besar dari AI_WORKER_POLL_MS (dalam detik)')
  }

  /*
   * Bun.serve memutus koneksi yang diam lebih lama dari idleTimeout (default 10 detik;
   * preset Nitro membacanya dari NITRO_BUN_IDLE_TIMEOUT, maks. 255). Heartbeat SSE yang
   * lebih lambat membuat stream terputus berulang (ERR_INCOMPLETE_CHUNKED_ENCODING).
   */
  const serverIdleTimeoutMs = readInt(env, 'NITRO_BUN_IDLE_TIMEOUT', 10, 1, 255, issues) * 1000
  if (config.realtime.heartbeatIntervalMs >= serverIdleTimeoutMs) {
    issues.push(
      `REALTIME_HEARTBEAT_MS (${config.realtime.heartbeatIntervalMs}) harus lebih kecil dari idle timeout server ` +
        `(${serverIdleTimeoutMs} ms, NITRO_BUN_IDLE_TIMEOUT) agar stream SSE tidak terputus`,
    )
  }

  if (issues.length > 0) throw new ConfigError(issues)
  return config
}
