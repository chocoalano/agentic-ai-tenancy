/**
 * Logger minimal. Di production menulis JSON per baris agar mudah diproses
 * agregator log; di development menulis teks yang mudah dibaca.
 * Jangan pernah mencatat password, token sesi, atau isi cookie.
 */
type Level = 'info' | 'warn' | 'error'

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export function createLogger(options: { json: boolean; silent?: boolean }): Logger {
  function write(level: Level, message: string, meta?: Record<string, unknown>) {
    if (options.silent) return
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
    if (options.json) sink(JSON.stringify({ level, message, time: new Date().toISOString(), ...meta }))
    else sink(`[api:${level}] ${message}`, meta ?? '')
  }
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  }
}
