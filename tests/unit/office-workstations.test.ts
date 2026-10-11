import { describe, expect, test } from 'bun:test'
import { ACTIVITY_PRESENTATION } from '../../app/game/agent-state'
import { STATION_ACTIVITY } from '../../app/game/commands'
import { OfficeEngine, type AgentSpec } from '../../app/game/engine'
import { ISLAND_ART_GEOMETRY } from '../../app/game/island-geometry'
import {
  STATION_DEFAULT_ACTIVITY,
  WORKSTATION_ACTIVITIES,
  defaultWorkstationActivity,
  workstationActivity,
  workstationVisuals,
  type WorkstationAgentView,
} from '../../app/game/workstations'
import { buildWorld, isWalkableIsland, type IslandId } from '../../app/game/world'
import { ISLAND_KEYS } from '../../app/utils/game-assets'

const world = buildWorld()

function spec(key: string, island: IslandId, slot = 0, preview = true): AgentSpec {
  return { key, character: 'sage', name: key, island, slot, activity: 'idle', preview }
}

/** Pandangan agent seperti yang dibangun useOfficeEngine untuk `workstationVisuals`. */
function view(engine: OfficeEngine): WorkstationAgentView[] {
  return [...engine.agents.values()].map((agent) => ({
    key: agent.key,
    island: agent.island,
    slot: agent.slot,
    activity: agent.activity,
    moving: agent.route.length > 0 || agent.queued !== null,
    preview: agent.preview,
  }))
}

function run(engine: OfficeEngine, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) engine.tick(1 / 60)
}

function runUntilArrived(engine: OfficeEngine, key: string) {
  for (let frame = 0; frame < 60 * 30 && (engine.agents.get(key)?.route.length ?? 0) > 0; frame += 1)
    engine.tick(1 / 60)
  expect(engine.agents.get(key)?.route).toEqual([])
}

describe('definisi aktivitas workstation', () => {
  test('setiap pulau yang dapat dijalani punya ≥ 3 aktivitas; pulau dekoratif tidak punya', () => {
    for (const id of ISLAND_KEYS) {
      const list = WORKSTATION_ACTIVITIES[id]
      if (isWalkableIsland(id)) expect(list.length).toBeGreaterThanOrEqual(3)
      else expect(list).toEqual([])
    }
  })

  test('id unik; animasi = presentasi state; state adalah aktivitas kerja; anchor = id slot geometri artwork', () => {
    const ids = new Set<string>()
    for (const id of ISLAND_KEYS) {
      for (const item of WORKSTATION_ACTIVITIES[id]) {
        expect(ids.has(item.id)).toBe(false)
        ids.add(item.id)
        expect(item.workstationId).toBe(id)
        expect(item.animation).toBe(ACTIVITY_PRESENTATION[item.activity].animation)
        expect(ACTIVITY_PRESENTATION[item.activity].workstationActive).toBe(true)
        expect(item.effects.length).toBeGreaterThan(0)
        expect(ISLAND_ART_GEOMETRY[id].workstationSlots.some((slot) => slot.id === item.interactionAnchorId)).toBe(true)
        expect(item.durationMode).toBe('simulated')
      }
    }
  })

  test('lima workstation utama memiliki tanda efek yang saling berbeda (dapat dikenali tanpa panel)', () => {
    const primary: IslandId[] = ['mission-hub', 'web-research', 'analytics-tool', 'report-builder', 'data-warehouse']
    const signatures = primary.map((id) => {
      const activity = defaultWorkstationActivity(id)
      if (!activity) throw new Error(`tanpa aktivitas default: ${id}`)
      return [...activity.effects].sort().join('+')
    })
    expect(new Set(signatures).size).toBe(primary.length)
    // Setiap stasiun utama hanya memakai efek yang tidak dipakai stasiun utama lain sebagai efek pertama.
    const leads = primary.map((id) => defaultWorkstationActivity(id)?.effects[0])
    expect(new Set(leads).size).toBe(primary.length)
  })

  test('aktivitas default stasiun adalah satu sumber kebenaran untuk STATION_ACTIVITY (perintah pratinjau)', () => {
    expect(STATION_ACTIVITY).toEqual(STATION_DEFAULT_ACTIVITY)
    expect(STATION_ACTIVITY['mission-hub']).toBe('communicating')
    expect(STATION_ACTIVITY['web-research']).toBe('researching')
    expect(STATION_ACTIVITY['analytics-tool']).toBe('working')
    expect(STATION_ACTIVITY['report-builder']).toBe('working')
    expect(STATION_ACTIVITY['data-warehouse']).toBe('using_tool')
    expect(STATION_ACTIVITY['knowledge-base']).toBe('reading')
    // Dekoratif: fallback tipe, tidak pernah dipakai karena pulau tidak dapat dituju.
    expect(STATION_ACTIVITY['research-lab']).toBe('thinking')
  })

  test('pencocokan state → aktivitas stasiun; state kerja yang tidak dikenal di pulau itu → null', () => {
    expect(workstationActivity('web-research', 'researching')?.id).toBe('web-research:research')
    expect(workstationActivity('web-research', 'using_tool')).toBeNull()
    expect(workstationActivity('analytics-tool', 'using_tool')?.label).toBe('Memproses data')
    expect(workstationActivity('research-lab', 'thinking')).toBeNull()
    expect(workstationActivity('mission-hub', 'idle')).toBeNull()
  })
})

describe('siklus hidup efek workstation (diturunkan dari state agent, bukan state kedua)', () => {
  test('tiba → efek menyala di anchor slot robot; durasi habis → padam', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'mission-hub')])
    expect(workstationVisuals(view(engine))).toEqual([])
    expect(engine.moveTo('sage', { island: 'web-research' }, { state: 'researching', seconds: 2, next: 'idle' })).toBe(
      true,
    )
    // Dalam perjalanan: belum ada efek (termasuk di pulau asal).
    run(engine, 0.5)
    expect(workstationVisuals(view(engine))).toEqual([])
    runUntilArrived(engine, 'sage')
    const agent = engine.agents.get('sage')
    if (!agent || agent.slot === null) throw new Error('agent tidak tiba di slot')
    const visuals = workstationVisuals(view(engine))
    expect(visuals).toHaveLength(1)
    expect(visuals[0]).toMatchObject({
      island: 'web-research',
      activityId: 'web-research:research',
      label: 'Meriset sumber pasar',
      durationMode: 'simulated',
    })
    expect(visuals[0]?.effects).toEqual(['document-holograms', 'search-rings'])
    expect(visuals[0]?.anchors).toEqual([{ key: 'sage', slot: agent.slot, anchorId: `slot-${agent.slot}` }])
    run(engine, 2.5)
    expect(agent.activity).toBe('idle')
    expect(workstationVisuals(view(engine))).toEqual([])
  })

  test('pembatalan/perintah baru saat bekerja mematikan efek; penerimaan perintah tidak dihitung sebagai aktivitas', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('bolt', 'report-builder')])
    expect(engine.setActivity('bolt', { state: 'working' })).toBe(true)
    expect(workstationVisuals(view(engine))[0]?.effects).toEqual(['typing-glow', 'document-assembly'])
    // Perintah baru: fase menerima (thinking) sambil berdiri di stasiun lama → bukan aktivitas stasiun.
    expect(engine.moveTo('bolt', { island: 'analytics-tool' }, { state: 'working' }, { acknowledgeSeconds: 0.5 })).toBe(
      true,
    )
    expect(workstationVisuals(view(engine))).toEqual([])
    run(engine, 0.6)
    expect(engine.agents.get('bolt')?.route.length).toBeGreaterThan(0)
    expect(workstationVisuals(view(engine))).toEqual([])
    runUntilArrived(engine, 'bolt')
    expect(workstationVisuals(view(engine))[0]).toMatchObject({
      island: 'analytics-tool',
      activityId: 'analytics-tool:analyze',
    })
    engine.cancel('bolt')
    expect(engine.setActivity('bolt', { state: 'idle' })).toBe(true)
    expect(workstationVisuals(view(engine))).toEqual([])
  })

  test('dua robot di satu pulau: satu visual per pulau dengan efek gabungan (unik) dan dua anchor', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('a', 'analytics-tool', 0), spec('b', 'analytics-tool', 1)])
    engine.setActivity('a', { state: 'working' })
    engine.setActivity('b', { state: 'thinking' })
    const visuals = workstationVisuals(view(engine))
    expect(visuals).toHaveLength(1)
    expect(visuals[0]?.effects).toEqual(['chart-hologram', 'data-particles'])
    expect(visuals[0]?.anchors.map((anchor) => anchor.anchorId).sort()).toEqual(['slot-0', 'slot-1'])
  })

  test('reaksi: menunggu persetujuan → beacon; selesai → ledakan; gagal → kedip merah (tanpa aktivitas stasiun)', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('echo', 'data-warehouse')])
    engine.setActivity('echo', { state: 'waiting_approval' })
    expect(workstationVisuals(view(engine))[0]).toMatchObject({ activityId: null, effects: ['approval-beacon'] })
    engine.setActivity('echo', { state: 'working' })
    expect(workstationVisuals(view(engine))[0]?.effects).toEqual(['terminal-lines'])
    engine.setActivity('echo', { state: 'completed', seconds: 1, next: 'idle' })
    expect(workstationVisuals(view(engine))[0]?.effects).toEqual(['completion-burst'])
    engine.setActivity('echo', { state: 'idle' })
    engine.setActivity('echo', { state: 'failed' })
    expect(workstationVisuals(view(engine))[0]?.effects).toEqual(['error-flicker'])
  })

  test('mode live: visual bertanda event-driven dan hanya dari state otoritatif (tidak ada aktivitas karangan)', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('agent-1', 'web-research', 0, false)])
    expect(workstationVisuals(view(engine))).toEqual([])
    // Hanya bila backend kelak menyatakan status runtime → state kerja; di sini disimulasikan lewat setActivity.
    engine.setActivity('agent-1', { state: 'researching' })
    expect(workstationVisuals(view(engine))[0]?.durationMode).toBe('event-driven')
  })
})
