import type { Cookie } from 'elysia'
import type { ApiConfig } from '../config/env'

type CookieJar = Record<string, Cookie<unknown>>

/**
 * Cookie sesi: HttpOnly (tidak terbaca JavaScript), SameSite=Lax, Secure di
 * production (dengan prefix __Host-), Path=/, kedaluwarsa mengikuti sesi.
 */
export function setSessionCookie(jar: CookieJar, config: ApiConfig, token: string, expiresAt: Date): void {
  jar[config.session.cookieName]?.set({
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.cookieSecure,
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(jar: CookieJar, config: ApiConfig): void {
  jar[config.session.cookieName]?.set({
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.session.cookieSecure,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
}

export function readSessionCookie(jar: CookieJar, config: ApiConfig): unknown {
  return jar[config.session.cookieName]?.value
}
