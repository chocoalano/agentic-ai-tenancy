import { describe, expect, test } from 'bun:test'
import type { AgentRealtimeEvent } from '../../domains/office/realtime'
import { liveActivity } from '../../app/game/agent-state'
import { liveAgentSpecs, mapRealtimeEvent, workActivityFor, type LiveGameAction } from '../../app/game/live-adapter'

const base = {
  eventId: 10,
  schemaVersion: 1,
  tenantId: 't',
  agentId: 'agent-1',
  taskId: 'task-1',
  runId: 'run-1',
  taskStatus: 'running' as const,
  runStatus: 'running' as const,
  occurredAt: new Date('2026-10-11T10:00:00Z'),
}

describe('pemetaan event backend → aksi game (mode live)', () => {
  test('setiap tipe event bisnis menghasilkan aksi presentasi yang tepat + konfirmasi waktu server', () => {
    const cases: Array<[AgentRealtimeEvent, LiveGameAction['type']]> = [
      [{ event: 'agent.task.created', data: { ...base, title: 'Riset pasar' } }, 'acknowledge'],
      [{ event: 'agent.task.queued', data: { ...base, title: 'Riset pasar' } }, 'queued'],
      [{ event: 'agent.run.started', data: { ...base, activity: 'Memulai eksekusi' } }, 'work'],
      [{ event: 'agent.run.activity', data: { ...base, activity: 'Menyusun ringkasan' } }, 'work'],
      [
        {
          event: 'agent.run.waiting_approval',
          data: {
            ...base,
            approvalId: 'a1',
            actionType: 'release_result',
            actionSummary: 'x',
            approvalStatus: 'pending',
          },
        },
        'wait_approval',
      ],
      [{ event: 'agent.run.completed', data: { ...base, released: true, outputType: 'text' } }, 'complete'],
      [
        {
          event: 'agent.run.failed',
          data: { ...base, errorCode: 'PROVIDER_TIMEOUT', errorMessage: 'Timeout', retryScheduled: true },
        },
        'fail',
      ],
      [{ event: 'agent.run.canceled', data: base }, 'cancel'],
      [
        {
          event: 'approval.decided',
          data: {
            ...base,
            approvalId: 'a1',
            actionType: 'release_result',
            actionSummary: 'x',
            approvalStatus: 'approved',
          },
        },
        'task_changed',
      ],
    ]
    for (const [event, expected] of cases) {
      const actions = mapRealtimeEvent(event)
      expect(actions[0]?.type).toBe(expected)
      expect(actions[1]).toEqual({ type: 'confirm', serverTime: base.occurredAt })
      if (actions[0] && 'agentId' in actions[0]) expect(actions[0].agentId).toBe('agent-1')
    }
  })

  test('closed → aksi closed dengan alasan; tidak ada aksi visual karangan', () => {
    expect(
      mapRealtimeEvent({ event: 'closed', data: { reason: 'SESSION_INVALID', serverTime: base.occurredAt } }),
    ).toEqual([{ type: 'closed', reason: 'SESSION_INVALID' }])
  })

  test('status runtime otoritatif → state visual; tanpa run aktif → siaga; non-aktif → offline', () => {
    expect(liveActivity('active', null)).toBe('idle')
    expect(liveActivity('active', 'thinking')).toBe('thinking')
    expect(liveActivity('active', 'working')).toBe('working')
    expect(liveActivity('active', 'waiting_approval')).toBe('waiting_approval')
    expect(liveActivity('paused', 'working')).toBe('offline')
    expect(liveActivity('draft', null)).toBe('offline')
    const specs = liveAgentSpecs(
      [
        { id: 'a', name: 'Nara', lifecycleStatus: 'active', runtimeStatus: 'working' },
        { id: 'b', name: 'Dimas', lifecycleStatus: 'active', runtimeStatus: null },
      ],
      new Map([
        ['a', { character: 'sage', stationId: 'web-research', slot: 0 }],
        ['b', { character: 'nova', stationId: 'client-brief', slot: 0 }],
      ]),
    )
    expect(specs.map((spec) => spec.activity)).toEqual(['working', 'idle'])
    // Setelah muat ulang, run yang sudah selesai tidak pernah memutar ulang perayaan: state dari API = siaga.
    expect(
      liveAgentSpecs(
        [{ id: 'b', name: 'Dimas', lifecycleStatus: 'active', runtimeStatus: null }],
        new Map([['b', { character: 'nova', stationId: 'client-brief', slot: 0 }]]),
      )[0]?.activity,
    ).toBe('idle')
  })

  test('aktivitas kerja stasiun untuk robot live: berkomunikasi dipetakan ke bekerja', () => {
    expect(workActivityFor('researching')).toBe('researching')
    expect(workActivityFor('communicating')).toBe('working')
  })
})
