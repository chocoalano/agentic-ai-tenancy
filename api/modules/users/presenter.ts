import type { User } from './repository'

/** Representasi pengguna yang aman dikirim ke klien. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  }
}
