import { RUN_ERROR_MESSAGES, type RunErrorCode } from '../../../domains/tasks/types'
import type { AgentRuntime, RuntimeEvent, RuntimeExecutionInput } from './types'

/*
 * Adapter provider dengan API Chat Completions yang kompatibel OpenAI, memakai
 * `fetch` bawaan (tanpa SDK pihak ketiga). Diverifikasi terhadap dokumentasi
 * DigitalOcean Gradient AI serverless inference (POST
 * https://inference.do-ai.run/v1/chat/completions, header
 * `Authorization: Bearer <model access key>`, body `model`, `messages`,
 * `max_completion_tokens`, `temperature`; respons `choices[].message.content`
 * dan `usage.prompt_tokens/completion_tokens`). Streaming tidak dipakai (tidak
 * terdokumentasi di provider tersebut) sehingga satu respons = satu observasi.
 *
 * Kredensial hanya ada di proses server; tidak pernah dicatat ke log.
 */
export interface OpenAiCompatibleOptions {
  baseUrl: string
  apiKey: string
  model: string
  fetch?: typeof fetch
  /** Nama provider untuk label (default 'openai-compatible'). */
  providerLabel?: string
}

interface ChatCompletionResponse {
  id?: unknown
  choices?: unknown
  usage?: unknown
}

function textOfContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  // Beberapa provider mengembalikan array bagian {type:'text', text}.
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const part of content) {
      if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
        parts.push(part.text)
      }
    }
    return parts.length > 0 ? parts.join('') : null
  }
  return null
}

function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null
}

function classifyStatus(status: number): { code: RunErrorCode; retryable: boolean } {
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', retryable: true }
  if (status === 408 || status === 504) return { code: 'PROVIDER_TIMEOUT', retryable: true }
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', retryable: true }
  return { code: 'PROVIDER_REJECTED', retryable: false }
}

export function createOpenAiCompatibleRuntime(options: OpenAiCompatibleOptions): AgentRuntime {
  const doFetch = options.fetch ?? fetch
  const provider = options.providerLabel ?? 'openai-compatible'
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`

  return {
    provider,
    model: options.model,
    available: true,
    kind: 'real',
    async *execute(input: RuntimeExecutionInput): AsyncIterable<RuntimeEvent> {
      const timeout = AbortSignal.timeout(input.limits.timeoutMs)
      const signal = AbortSignal.any([input.signal, timeout])
      const system = [
        `Anda adalah ${input.agent.name}, ${input.agent.roleTitle} di sebuah perusahaan.`,
        input.agent.mainInstruction ? `Instruksi utama: ${input.agent.mainInstruction}` : '',
        'Jawab dalam Bahasa Indonesia secara terstruktur dan ringkas. Jangan mengarang data; nyatakan asumsi dengan jelas.',
      ]
        .filter(Boolean)
        .join('\n')

      let response: Response
      try {
        response = await doFetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
            accept: 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: input.instruction },
            ],
            max_completion_tokens: input.limits.maxOutputTokens,
            temperature: input.limits.temperature,
            stream: false,
          }),
          signal,
        })
      } catch (error) {
        if (input.signal.aborted) {
          yield { type: 'failed', code: 'CANCELED', message: RUN_ERROR_MESSAGES.CANCELED, retryable: false }
          return
        }
        if (timeout.aborted) {
          yield {
            type: 'failed',
            code: 'PROVIDER_TIMEOUT',
            message: RUN_ERROR_MESSAGES.PROVIDER_TIMEOUT,
            retryable: true,
          }
          return
        }
        void error
        yield {
          type: 'failed',
          code: 'PROVIDER_UNAVAILABLE',
          message: RUN_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
          retryable: true,
        }
        return
      }

      const providerRequestId = response.headers.get('x-request-id')
      if (!response.ok) {
        const { code, retryable } = classifyStatus(response.status)
        yield { type: 'started', provider, model: options.model, providerRequestId }
        yield { type: 'failed', code, message: `${RUN_ERROR_MESSAGES[code]} (HTTP ${response.status})`, retryable }
        return
      }

      let parsed: ChatCompletionResponse
      try {
        parsed = (await response.json()) as ChatCompletionResponse
      } catch {
        yield { type: 'started', provider, model: options.model, providerRequestId }
        yield {
          type: 'failed',
          code: 'PROVIDER_INVALID_RESPONSE',
          message: RUN_ERROR_MESSAGES.PROVIDER_INVALID_RESPONSE,
          retryable: false,
        }
        return
      }
      const requestId = typeof parsed.id === 'string' && parsed.id ? parsed.id : providerRequestId
      yield { type: 'started', provider, model: options.model, providerRequestId: requestId }

      const first = Array.isArray(parsed.choices) ? parsed.choices[0] : undefined
      const message =
        typeof first === 'object' && first !== null && 'message' in first ? Reflect.get(first, 'message') : undefined
      const content =
        typeof message === 'object' && message !== null && 'content' in message
          ? textOfContent(Reflect.get(message, 'content'))
          : null
      if (content === null) {
        yield {
          type: 'failed',
          code: 'PROVIDER_INVALID_RESPONSE',
          message: RUN_ERROR_MESSAGES.PROVIDER_INVALID_RESPONSE,
          retryable: false,
        }
        return
      }
      if (content.length > input.limits.maxOutputChars) {
        yield {
          type: 'failed',
          code: 'OUTPUT_TOO_LARGE',
          message: RUN_ERROR_MESSAGES.OUTPUT_TOO_LARGE,
          retryable: false,
        }
        return
      }
      yield { type: 'output', outputType: 'markdown', content }
      const usage = typeof parsed.usage === 'object' && parsed.usage !== null ? parsed.usage : null
      yield {
        type: 'usage',
        inputTokens: usage ? intOrNull(Reflect.get(usage, 'prompt_tokens')) : null,
        outputTokens: usage ? intOrNull(Reflect.get(usage, 'completion_tokens')) : null,
      }
      yield { type: 'completed' }
    },
  }
}
