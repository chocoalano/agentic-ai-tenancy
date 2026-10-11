import type { AgentLifecycleStatus, AgentRuntimeStatus } from '~~/domains/agents/types'

interface StatusPresentation {
  label: string
  /** Kelas warna berbasis token semantik (lihat assets/css/tailwind.css). */
  tone: string
  dot: string
}

export const LIFECYCLE_PRESENTATION: Record<AgentLifecycleStatus, StatusPresentation> = {
  draft: { label: 'Draf', tone: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  active: { label: 'Aktif', tone: 'border-success/30 bg-success/12 text-success', dot: 'bg-success' },
  paused: { label: 'Dijeda', tone: 'border-warning/30 bg-warning/12 text-warning', dot: 'bg-warning' },
  archived: { label: 'Diarsipkan', tone: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
}

export const RUNTIME_PRESENTATION: Record<AgentRuntimeStatus, StatusPresentation> = {
  idle: { label: 'Siaga', tone: 'border-agent-idle/30 bg-agent-idle/12 text-agent-idle', dot: 'bg-agent-idle' },
  working: {
    label: 'Bekerja',
    tone: 'border-agent-working/30 bg-agent-working/12 text-agent-working',
    dot: 'bg-agent-working',
  },
  thinking: {
    label: 'Berpikir',
    tone: 'border-agent-thinking/30 bg-agent-thinking/12 text-agent-thinking',
    dot: 'bg-agent-thinking',
  },
  using_tool: {
    label: 'Memakai alat',
    tone: 'border-agent-tool/30 bg-agent-tool/12 text-agent-tool',
    dot: 'bg-agent-tool',
  },
  waiting_approval: {
    label: 'Menunggu persetujuan',
    tone: 'border-agent-approval/30 bg-agent-approval/12 text-agent-approval',
    dot: 'bg-agent-approval',
  },
  failed: {
    label: 'Gagal',
    tone: 'border-agent-failed/30 bg-agent-failed/12 text-agent-failed',
    dot: 'bg-agent-failed',
  },
}

/** Ditampilkan saat runtime belum terhubung (Phase 1): bukan status palsu. */
export const RUNTIME_DISCONNECTED: StatusPresentation = {
  label: 'Runtime belum terhubung',
  tone: 'border-agent-offline/30 bg-agent-offline/10 text-agent-offline',
  dot: 'bg-agent-offline',
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const LIFECYCLE_ORDER: Record<AgentLifecycleStatus, number> = { active: 0, paused: 1, draft: 2, archived: 3 }

/** Jumlah agent per status siklus hidup (data nyata dari API). */
export function countByLifecycle(agents: ReadonlyArray<{ lifecycleStatus: AgentLifecycleStatus }>) {
  const counts: Record<AgentLifecycleStatus, number> = { active: 0, paused: 0, draft: 0, archived: 0 }
  for (const agent of agents) counts[agent.lifecycleStatus] += 1
  return counts
}

/** Urutan tampilan: aktif → dijeda → draf → arsip, lalu nama. */
export function sortByLifecycle<T extends { lifecycleStatus: AgentLifecycleStatus; name: string }>(
  agents: ReadonlyArray<T>,
): T[] {
  return [...agents].sort(
    (left, right) =>
      LIFECYCLE_ORDER[left.lifecycleStatus] - LIFECYCLE_ORDER[right.lifecycleStatus] ||
      left.name.localeCompare(right.name, 'id'),
  )
}
