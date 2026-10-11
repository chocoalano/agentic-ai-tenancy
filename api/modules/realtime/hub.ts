import type { SQL } from 'bun'
import type { Logger } from '../../core/http/logger'
import { latestOutboxId, readOutboxAfter, type OutboxRow } from './outbox'

/*
 * Hub realtime per proses: menyalurkan baris outbox pasca-commit ke koneksi SSE.
 *
 * - Satu poller per proses (bukan per koneksi), hanya aktif selama ada
 *   pelanggan; kursor dimulai dari id outbox terakhir saat pelanggan pertama
 *   datang (event lama diputar ulang per koneksi lewat Last-Event-ID, bukan
 *   lewat feed langsung).
 * - Penyaluran disaring per tenant di sini; izin per koneksi diperiksa oleh
 *   koneksi SSE sebelum menulis ke klien.
 * - Worker eksekusi mungkin berjalan di proses lain: outbox di PostgreSQL
 *   adalah satu-satunya jalur, sehingga tidak ada event yang hilang antar proses.
 */
export interface HubSubscriber {
  tenantId: string
  deliver(row: OutboxRow): void
}

export interface RealtimeHub {
  subscribe(subscriber: HubSubscriber): () => void
  /** Satu putaran polling (dipakai test; loop produksi memanggilnya berkala). */
  poll(): Promise<number>
  readonly subscriberCount: number
  readonly cursor: number
  stop(): void
}

export function createRealtimeHub(deps: { sql: SQL; pollMs: number; logger: Logger; batchSize?: number }): RealtimeHub {
  const subscribers = new Set<HubSubscriber>()
  const batchSize = deps.batchSize ?? 500
  let cursor = -1
  let timer: ReturnType<typeof setTimeout> | null = null
  let polling: Promise<number> | null = null
  let stopped = false

  async function poll(): Promise<number> {
    if (polling) return polling
    polling = (async () => {
      try {
        if (cursor < 0) cursor = await latestOutboxId(deps.sql)
        let delivered = 0
        // Baca sampai tidak ada baris baru (maks. beberapa batch per putaran).
        for (let round = 0; round < 4; round += 1) {
          const rows = await readOutboxAfter(deps.sql, cursor, batchSize)
          if (rows.length === 0) break
          for (const row of rows) {
            cursor = Math.max(cursor, row.id)
            for (const subscriber of subscribers) {
              if (subscriber.tenantId !== row.tenant_id) continue
              try {
                subscriber.deliver(row)
                delivered += 1
              } catch (error) {
                deps.logger.warn('Pelanggan realtime gagal menerima event', { error: String(error) })
              }
            }
          }
          if (rows.length < batchSize) break
        }
        return delivered
      } catch (error) {
        deps.logger.warn('Polling outbox realtime gagal', { error: String(error) })
        return 0
      } finally {
        polling = null
      }
    })()
    return polling
  }

  function schedule() {
    if (stopped || timer || subscribers.size === 0) return
    timer = setTimeout(async () => {
      timer = null
      await poll()
      schedule()
    }, deps.pollMs)
  }

  return {
    subscribe(subscriber) {
      subscribers.add(subscriber)
      // Pelanggan pertama: tetapkan kursor sekarang agar event yang terjadi setelah ini tersalurkan.
      void poll().then(schedule)
      return () => {
        subscribers.delete(subscriber)
        if (subscribers.size === 0 && timer) {
          clearTimeout(timer)
          timer = null
        }
      }
    },
    poll,
    get subscriberCount() {
      return subscribers.size
    },
    get cursor() {
      return cursor
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
      subscribers.clear()
    },
  }
}
