import { describe, expect, test } from 'bun:test'
import { checkCrossOrigin } from '../../api/core/security/cross-origin'

function request(method: string, headers: Record<string, string>) {
  return new Request('http://localhost:3000/api/v1/auth/login', { method, headers })
}

describe('checkCrossOrigin (proteksi CSRF)', () => {
  test('metode aman selalu diizinkan', () => {
    expect(checkCrossOrigin(request('GET', { 'sec-fetch-site': 'cross-site' }), []).allowed).toBe(true)
  })

  test('Sec-Fetch-Site same-origin/none diizinkan, cross-site/same-site ditolak', () => {
    expect(checkCrossOrigin(request('POST', { 'sec-fetch-site': 'same-origin' }), []).allowed).toBe(true)
    expect(checkCrossOrigin(request('POST', { 'sec-fetch-site': 'none' }), []).allowed).toBe(true)
    expect(checkCrossOrigin(request('POST', { 'sec-fetch-site': 'cross-site' }), []).allowed).toBe(false)
    expect(checkCrossOrigin(request('POST', { 'sec-fetch-site': 'same-site' }), []).allowed).toBe(false)
  })

  test('fallback Origin: harus sama dengan Host', () => {
    const host = { host: 'localhost:3000' }
    expect(checkCrossOrigin(request('POST', { ...host, origin: 'http://localhost:3000' }), []).allowed).toBe(true)
    expect(checkCrossOrigin(request('POST', { ...host, origin: 'https://evil.example' }), []).allowed).toBe(false)
    expect(checkCrossOrigin(request('DELETE', { ...host, origin: 'null' }), []).allowed).toBe(false)
  })

  test('origin tepercaya diizinkan meskipun lintas situs', () => {
    const headers = { host: 'api.example.com', origin: 'https://app.example.com', 'sec-fetch-site': 'same-site' }
    expect(checkCrossOrigin(request('POST', headers), ['https://app.example.com']).allowed).toBe(true)
  })

  test('klien non-browser tanpa Origin/Sec-Fetch-Site diizinkan', () => {
    expect(checkCrossOrigin(request('POST', {}), []).allowed).toBe(true)
  })
})
