/**
 * Worker eksekusi tugas AI employee sebagai proses Bun mandiri:
 *
 *   bun run worker
 *
 * Memakai konfigurasi, pool, gerbang kesiapan, dan adapter runtime yang sama
 * dengan API. Proses berhenti dengan kode 1 bila role/RLS database tidak aman
 * (fail-closed) dan menunggu sampai database terjangkau sebelum mengklaim
 * pekerjaan. SIGTERM/SIGINT: berhenti mengklaim, membatalkan eksekusi aktif
 * dengan alasan SHUTDOWN (run dikembalikan ke antrean), lalu keluar.
 *
 * Beberapa worker boleh berjalan bersamaan: klaim atomik (FOR UPDATE SKIP
 * LOCKED) + lease memastikan satu run hanya dikerjakan satu worker pada satu
 * waktu; lease yang kedaluwarsa dipulihkan worker mana pun.
 */
import { loadApiConfig } from './core/config/env'
import { createDependencies, createReadinessGate } from './container'
import { createExecutionWorker } from './modules/runs/worker'

const config = loadApiConfig()
const deps = createDependencies({ config })
const readiness = createReadinessGate(deps)

const initial = await readiness.verify({ force: true })
if (initial.status === 'misconfigured') {
  deps.logger.error('Worker berhenti: konfigurasi database tidak aman', { problems: initial.problems })
  process.exit(1)
}
if (initial.status !== 'ready') {
  deps.logger.warn('Database belum terjangkau; worker menunggu sebelum mengklaim pekerjaan')
  await readiness.waitUntilReady()
}
if (!deps.runtime.available) {
  deps.logger.warn(
    'AI_RUNTIME_PROVIDER=none: worker hanya memulihkan lease/persetujuan kedaluwarsa; eksekusi nyata tidak tersedia',
  )
}

const worker = createExecutionWorker(deps)
worker.start()

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  deps.logger.info('Worker menerima sinyal berhenti', { signal, active: worker.active })
  await worker.stop()
  await deps.sql.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
