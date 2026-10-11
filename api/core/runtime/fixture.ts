import { createHash } from 'node:crypto'
import { RUN_ERROR_MESSAGES } from '../../../domains/tasks/types'
import type { AgentRuntime, RuntimeEvent, RuntimeExecutionInput } from './types'

/*
 * Adapter FIXTURE deterministik — BUKAN runtime AI. Dipakai test otomatis dan
 * pengembangan lokal (AI_RUNTIME_PROVIDER=fixture; ditolak di production) untuk
 * memverifikasi worker, persistensi, event, dan game tanpa provider nyata.
 * Keluarannya selalu berlabel fixture; perilaku khusus dikendalikan penanda di
 * instruksi:
 *   [fixture:fail]        → gagal non-retryable (PROVIDER_REJECTED)
 *   [fixture:timeout]     → gagal retryable (PROVIDER_TIMEOUT)
 *   [fixture:slow:<ms>]   → menunggu <ms> (dapat dibatalkan) sebelum selesai
 *   [fixture:large]       → keluaran melebihi batas (OUTPUT_TOO_LARGE)
 */
export const FIXTURE_MODEL = 'fixture-deterministic-v1'

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason instanceof Error ? signal.reason : new Error('dibatalkan'))
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('dibatalkan'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function createFixtureRuntime(): AgentRuntime {
  return {
    provider: 'fixture',
    model: FIXTURE_MODEL,
    available: true,
    kind: 'fixture',
    async *execute(input: RuntimeExecutionInput): AsyncIterable<RuntimeEvent> {
      const digest = createHash('sha256').update(`${input.taskId}:${input.instruction}`).digest('hex').slice(0, 12)
      yield { type: 'started', provider: 'fixture', model: FIXTURE_MODEL, providerRequestId: `fixture-${digest}` }
      const slow = /\[fixture:slow:(\d+)\]/.exec(input.instruction)
      if (slow?.[1]) {
        yield { type: 'activity', activity: 'Memproses (fixture lambat)' }
        try {
          await sleep(Number(slow[1]), input.signal)
        } catch {
          yield { type: 'failed', code: 'CANCELED', message: RUN_ERROR_MESSAGES.CANCELED, retryable: false }
          return
        }
      }
      if (input.instruction.includes('[fixture:fail]')) {
        yield {
          type: 'failed',
          code: 'PROVIDER_REJECTED',
          message: RUN_ERROR_MESSAGES.PROVIDER_REJECTED,
          retryable: false,
        }
        return
      }
      if (input.instruction.includes('[fixture:timeout]')) {
        yield {
          type: 'failed',
          code: 'PROVIDER_TIMEOUT',
          message: RUN_ERROR_MESSAGES.PROVIDER_TIMEOUT,
          retryable: true,
        }
        return
      }
      yield { type: 'activity', activity: 'Menyusun ringkasan (fixture)' }
      const body = input.instruction.includes('[fixture:large]')
        ? 'x'.repeat(input.limits.maxOutputChars + 1)
        : [
            `[FIXTURE DETERMINISTIK — BUKAN HASIL MODEL AI]`,
            `Agent: ${input.agent.name} (${input.agent.roleTitle})`,
            `Tugas: ${input.instruction.replace(/\[fixture:[^\]]+\]/g, '').trim()}`,
            `Ringkasan: keluaran ini dibuat secara deterministik dari instruksi (sidik ${digest}) untuk memverifikasi alur eksekusi, bukan jawaban AI.`,
          ].join('\n')
      if (body.length > input.limits.maxOutputChars) {
        yield {
          type: 'failed',
          code: 'OUTPUT_TOO_LARGE',
          message: RUN_ERROR_MESSAGES.OUTPUT_TOO_LARGE,
          retryable: false,
        }
        return
      }
      yield { type: 'output', outputType: 'text', content: body }
      // Fixture tidak mengarang angka token: usage null.
      yield { type: 'usage', inputTokens: null, outputTokens: null }
      yield { type: 'completed' }
    },
  }
}
