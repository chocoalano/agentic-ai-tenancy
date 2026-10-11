import type { SQL, TransactionSQL } from 'bun'

export type UserStatus = 'active' | 'disabled'

export interface User {
  id: string
  email: string
  displayName: string
  status: UserStatus
  createdAt: Date
}

interface UserRow {
  id: string
  email: string
  display_name: string
  status: UserStatus
  created_at: Date
}

interface UserCredentialRow extends UserRow {
  password_hash: string
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
  }
}

/** Repository identitas global. Tabel users tidak tenant-scoped. */
export const usersRepository = {
  async findCredentialsByEmail(sql: SQL, email: string): Promise<(User & { passwordHash: string }) | null> {
    const [row] = await sql<UserCredentialRow[]>`
      select id, email, display_name, status, created_at, password_hash
      from users
      where email = ${email}
    `
    return row ? { ...toUser(row), passwordHash: row.password_hash } : null
  },

  async create(tx: TransactionSQL, input: { email: string; displayName: string; passwordHash: string }): Promise<User> {
    const [row] = await tx<UserRow[]>`
      insert into users (email, display_name, password_hash)
      values (${input.email}, ${input.displayName}, ${input.passwordHash})
      returning id, email, display_name, status, created_at
    `
    if (!row) throw new Error('Insert users tidak mengembalikan baris')
    return toUser(row)
  },
}
