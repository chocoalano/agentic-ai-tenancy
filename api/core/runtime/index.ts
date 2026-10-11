import { RUN_ERROR_MESSAGES } from '../../../domains/tasks/types'
import type { ApiConfig } from '../config/env'
import { createFixtureRuntime } from './fixture'
import { createOpenAiCompatibleRuntime } from './openai-compatible'
import type { AgentRuntime, RuntimeEvent } from './types'

export type { AgentRuntime, RuntimeEvent, RuntimeExecutionInput, RuntimeLimits } from './types'

/** Runtime "tidak dikonfigurasi": eksekusi nyata tidak tersedia; tugas ditolak sebelum dibuat. */
export function createUnavailableRuntime(): AgentRuntime {
  return {
    provider: 'none',
    model: '',
    available: false,
    kind: 'none',
    async *execute(): AsyncIterable<RuntimeEvent> {
      yield {
        type: 'failed',
        code: 'RUNTIME_NOT_CONFIGURED',
        message: RUN_ERROR_MESSAGES.RUNTIME_NOT_CONFIGURED,
        retryable: false,
      }
    },
  }
}

/** Memilih adapter dari konfigurasi server (kredensial tidak pernah keluar dari proses). */
export function createAgentRuntime(config: ApiConfig['ai'], options: { fetch?: typeof fetch } = {}): AgentRuntime {
  switch (config.provider) {
    case 'openai-compatible':
      return createOpenAiCompatibleRuntime({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        fetch: options.fetch,
        providerLabel: /do-ai\.run/.test(config.baseUrl) ? 'digitalocean-gradient' : 'openai-compatible',
      })
    case 'fixture':
      return createFixtureRuntime()
    case 'none':
      return createUnavailableRuntime()
  }
}
