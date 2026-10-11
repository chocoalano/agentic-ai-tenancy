/**
 * Mode standalone (`bun api/standalone.ts`) menegakkan gerbang kesiapan yang
 * sama dengan mode mount: siap → melayani; database tidak terjangkau → tetap
 * berjalan dengan 503 sampai pulih; role tidak aman → berhenti (exit 1).
 */
import { describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import type { Subprocess } from 'bun'
import { TEST_SESSION_SECRET, testDatabaseUrls } from '../helpers/env'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('port'))))
    })
  })
}

async function spawnStandalone(databaseUrl: string) {
  const port = await freePort()
  const child = Bun.spawn(['bun', 'api/standalone.ts'], {
    env: {
      ...process.env,
      // development: logger menulis teks ke stderr (di 'test' logger diam).
      NODE_ENV: 'development',
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: TEST_SESSION_SECRET,
      API_STANDALONE_PORT: String(port),
      DATABASE_CONNECT_TIMEOUT_SECONDS: '2',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const base = `http://127.0.0.1:${port}`
  return { child, base, port }
}

async function waitForPort(base: string, child: Subprocess): Promise<Response> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`proses berhenti lebih awal (exit ${child.exitCode})`)
    try {
      return await fetch(`${base}/v1/health`)
    } catch {
      await Bun.sleep(50)
    }
  }
  throw new Error('server standalone tidak membuka port')
}

async function stop(child: Subprocess) {
  child.kill()
  await child.exited
}

describe('API standalone (Bun/Elysia tanpa Nuxt)', () => {
  test('7a. database tersedia: health 200 dan endpoint terlindungi lolos gerbang', async () => {
    const { child, base } = await spawnStandalone(testDatabaseUrls().app)
    try {
      const health = await waitForPort(base, child)
      expect(health.status).toBe(200)
      expect(await health.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } })
      const me = await fetch(`${base}/v1/auth/me`)
      expect(me.status).toBe(401)
    } finally {
      await stop(child)
    }
  }, 30_000)

  test('7b. database tidak terjangkau: tetap berjalan, request tenant 503, health degraded', async () => {
    const { child, base } = await spawnStandalone('postgresql://nobody:nobody@127.0.0.1:1/nowhere')
    try {
      const health = await waitForPort(base, child)
      expect(health.status).toBe(503)
      expect(await health.json()).toMatchObject({ status: 'degraded', checks: { database: 'unavailable' } })
      const agents = await fetch(`${base}/v1/agents`)
      expect(agents.status).toBe(503)
      expect(await agents.json()).toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
      expect(child.exitCode).toBeNull()
    } finally {
      await stop(child)
    }
  }, 30_000)

  test('7c. role tidak aman (pemilik tabel): proses berhenti dengan kode 1 tanpa melayani', async () => {
    const { child } = await spawnStandalone(testDatabaseUrls().owner)
    const exitCode = await Promise.race([child.exited, Bun.sleep(15_000).then(() => -1)])
    if (exitCode === -1) {
      await stop(child)
      throw new Error('proses tidak berhenti')
    }
    expect(exitCode).toBe(1)
    const stderr = await new Response(child.stderr).text()
    expect(stderr).toContain('konfigurasi database tidak aman')
  }, 30_000)
})
