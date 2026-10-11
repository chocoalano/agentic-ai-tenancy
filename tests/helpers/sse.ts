import type { TestApp } from './app'

export interface SseFrame {
  event: string
  id: string | null
  data: Record<string, unknown>
}

/**
 * Membuka stream SSE terhadap instance Elysia in-process dan membaca frame
 * satu per satu dengan batas waktu. `close()` membatalkan request (seperti
 * klien yang memutus koneksi).
 */
export async function openSseStream(
  app: TestApp,
  cookie: string,
  options: { lastEventId?: number; headers?: Record<string, string> } = {},
) {
  const controller = new AbortController()
  const headers: Record<string, string> = { host: 'localhost:3000', cookie, ...options.headers }
  if (options.lastEventId !== undefined) headers['last-event-id'] = String(options.lastEventId)
  const response = await app.app.handle(
    new Request('http://localhost:3000/v1/realtime/stream', { headers, signal: controller.signal }),
  )
  const reader = response.body?.getReader() ?? null
  const decoder = new TextDecoder()
  let buffer = ''
  const frames: SseFrame[] = []

  function parse(block: string): SseFrame | null {
    let event = 'message'
    let id: string | null = null
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('id:')) id = line.slice(3).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (dataLines.length === 0) return null
    let data: unknown
    try {
      data = JSON.parse(dataLines.join('\n'))
    } catch {
      data = { raw: dataLines.join('\n') }
    }
    return { event, id, data: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {} }
  }

  async function pump(): Promise<boolean> {
    if (!reader) return false
    const { value, done } = await reader.read()
    if (done) return false
    // In-process (app.handle) chunk dapat berupa string; lewat jaringan berupa Uint8Array.
    buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const frame = parse(block)
      if (frame) frames.push(frame)
      index = buffer.indexOf('\n\n')
    }
    return true
  }

  return {
    status: response.status,
    headers: response.headers,
    /** Frame berikutnya (menunggu paling lama `timeoutMs`); null bila habis waktu atau stream berakhir. */
    async next(timeoutMs = 3_000): Promise<SseFrame | null> {
      const deadline = Date.now() + timeoutMs
      while (frames.length === 0) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) return null
        const more = await Promise.race([pump(), Bun.sleep(remaining).then(() => 'timeout' as const)])
        if (more === 'timeout') return null
        if (more === false) return frames.shift() ?? null
      }
      return frames.shift() ?? null
    },
    /** Mengumpulkan frame sampai predikat terpenuhi atau habis waktu. */
    async until(predicate: (frame: SseFrame) => boolean, timeoutMs = 5_000): Promise<SseFrame[]> {
      const collected: SseFrame[] = []
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const frame = await this.next(deadline - Date.now())
        if (!frame) break
        collected.push(frame)
        if (predicate(frame)) break
      }
      return collected
    },
    close() {
      controller.abort()
      void reader?.cancel().catch(() => {})
    },
  }
}
