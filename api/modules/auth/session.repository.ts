import type { SQL } from 'bun'
import type { User } from '../users/repository'

export interface ActiveSession {
  sessionId: string
  activeTenantId: string | null
  expiresAt: Date
  lastSeenAt: Date
  user: User
}

interface ActiveSessionRow {
  session_id: string
  active_tenant_id: string | null
  expires_at: Date
  last_seen_at: Date
  user_id: string
  email: string
  display_name: string
  user_status: 'active' | 'disabled'
  user_created_at: Date
}

export const sessionsRepository = {
  async create(
    sql: SQL,
    input: {
      userId: string
      tokenHash: string
      expiresAt: Date
      userAgent: string | null
      activeTenantId: string | null
    },
  ): Promise<{ sessionId: string }> {
    const [row] = await sql<{ id: string }[]>`
      insert into sessions (user_id, token_hash, expires_at, user_agent, active_tenant_id)
      values (${input.userId}, ${input.tokenHash}, ${input.expiresAt}, ${input.userAgent}, ${input.activeTenantId})
      returning id
    `
    if (!row) throw new Error('Insert sessions tidak mengembalikan baris')
    return { sessionId: row.id }
  },

  /** Hanya sesi yang belum dicabut, belum kedaluwarsa, dan milik pengguna aktif. */
  async findActiveByTokenHash(sql: SQL, tokenHash: string): Promise<ActiveSession | null> {
    const [row] = await sql<ActiveSessionRow[]>`
      select
        s.id as session_id,
        s.active_tenant_id,
        s.expires_at,
        s.last_seen_at,
        u.id as user_id,
        u.email,
        u.display_name,
        u.status as user_status,
        u.created_at as user_created_at
      from sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${tokenHash}
        and s.revoked_at is null
        and s.expires_at > now()
        and u.status = 'active'
    `
    if (!row) return null
    return {
      sessionId: row.session_id,
      activeTenantId: row.active_tenant_id,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        status: row.user_status,
        createdAt: row.user_created_at,
      },
    }
  },

  /** Memperbarui last_seen_at paling sering sekali per interval untuk menghindari write di setiap request. */
  async touch(sql: SQL, sessionId: string, minIntervalSeconds: number): Promise<void> {
    await sql`
      update sessions
      set last_seen_at = now()
      where id = ${sessionId}
        and last_seen_at < now() - make_interval(secs => ${minIntervalSeconds})
    `
  },

  async revoke(sql: SQL, sessionId: string): Promise<boolean> {
    const rows = await sql`
      update sessions set revoked_at = now()
      where id = ${sessionId} and revoked_at is null
      returning id
    `
    return rows.length > 0
  },

  async setActiveTenant(sql: SQL, sessionId: string, tenantId: string | null): Promise<void> {
    await sql`update sessions set active_tenant_id = ${tenantId} where id = ${sessionId} and revoked_at is null`
  },
}
