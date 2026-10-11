import type { OutputType, RunErrorCode } from '../../../domains/tasks/types'

/*
 * Antarmuka AI Runtime yang dapat diganti (AgentTaskService → worker → runtime
 * → adapter provider). Adapter HANYA memancarkan event yang benar-benar
 * diamati dari provider: tidak ada persentase progres karangan, tidak ada
 * penalaran model (chain-of-thought), tidak ada angka usage yang ditebak.
 */

export interface RuntimeAgentProfile {
  name: string
  roleTitle: string
  mainInstruction: string
}

export interface RuntimeLimits {
  maxOutputTokens: number
  maxOutputChars: number
  timeoutMs: number
  temperature: number
}

export interface RuntimeExecutionInput {
  runId: string
  taskId: string
  agentId: string
  tenantId: string
  instruction: string
  agent: RuntimeAgentProfile
  limits: RuntimeLimits
  signal: AbortSignal
}

export type RuntimeEvent =
  | { type: 'started'; provider: string; model: string; providerRequestId: string | null }
  /** Deskripsi aktivitas tingkat tinggi yang aman ditampilkan (bukan isi penalaran model). */
  | { type: 'activity'; activity: string }
  | { type: 'output'; outputType: OutputType; content: string }
  | { type: 'usage'; inputTokens: number | null; outputTokens: number | null }
  | { type: 'completed' }
  | { type: 'failed'; code: RunErrorCode; message: string; retryable: boolean }

export interface AgentRuntime {
  readonly provider: string
  readonly model: string
  /** false = eksekusi nyata tidak tersedia (belum dikonfigurasi); tugas ditolak sebelum dibuat. */
  readonly available: boolean
  /** Label jujur untuk UI: 'real' (provider nyata), 'fixture' (deterministik, bukan AI), 'none'. */
  readonly kind: 'real' | 'fixture' | 'none'
  execute(input: RuntimeExecutionInput): AsyncIterable<RuntimeEvent>
}

export class RuntimeFailure extends Error {
  constructor(
    readonly code: RunErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'RuntimeFailure'
  }
}
