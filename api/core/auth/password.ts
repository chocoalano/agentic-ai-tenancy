/**
 * Hashing password memakai Argon2id bawaan Bun (`Bun.password`).
 * Parameter mengikuti rekomendasi minimum OWASP: m=19 MiB, t=2.
 */
export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../domains/auth/password-policy'

const ARGON2_OPTIONS = { algorithm: 'argon2id', memoryCost: 19_456, timeCost: 2 } as const

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2_OPTIONS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

let dummyHash: Promise<string> | undefined

/**
 * Dipakai saat email tidak ditemukan agar waktu respons login setara dengan
 * login yang gagal karena password salah (mengurangi enumerasi akun via timing).
 */
export async function verifyAgainstDummyHash(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalization')
  await Bun.password.verify(password, await dummyHash)
}
