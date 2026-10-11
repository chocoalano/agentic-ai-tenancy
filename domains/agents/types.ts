/**
 * Status siklus hidup konfigurasi AI employee. Ini adalah state bisnis yang
 * disimpan di database (draft → active → paused → archived).
 */
export const AGENT_LIFECYCLE_STATUSES = ['draft', 'active', 'paused', 'archived'] as const
export type AgentLifecycleStatus = (typeof AGENT_LIFECYCLE_STATUSES)[number]

/**
 * Status runtime yang kelak dilaporkan oleh Agent Orchestrator. Phase 1 belum
 * memiliki orchestrator, sehingga backend selalu mengembalikan `null` untuk
 * status runtime dan UI menampilkan "runtime belum terhubung" — bukan status
 * palsu.
 */
export const AGENT_RUNTIME_STATUSES = [
  'idle',
  'working',
  'thinking',
  'using_tool',
  'waiting_approval',
  'failed',
] as const
export type AgentRuntimeStatus = (typeof AGENT_RUNTIME_STATUSES)[number]

export function isAgentAssignable(status: AgentLifecycleStatus): boolean {
  return status === 'active'
}
