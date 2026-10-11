import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVITY_STATES, canTransition, liveActivity } from '../../app/game/agent-state'
import { AGENT_ANIMATIONS, AGENT_SHEET, ANIMATION_ROWS } from '../../app/game/animation-spec'
import { AGENT_COMMANDS, parsePreviewInstruction } from '../../app/game/commands'
import { OfficeEngine, type AgentSpec } from '../../app/game/engine'
import { liveAgentSpecs, mapRealtimeEvent } from '../../app/game/live-adapter'
import { findRoute, islandPath } from '../../app/game/navigation'
import { ATLAS_PHASES, SimulationController, atlasAgentSpecs } from '../../app/game/simulation'
import { buildWorld, insidePolygon, type IslandId } from '../../app/game/world'
import { CHARACTER_KEYS } from '../../app/utils/game-assets'

const world = buildWorld()
const NAMES = { nova: 'Nova', sage: 'Sage', pixel: 'Pixel', bolt: 'Bolt', echo: 'Echo' } as const

function spec(key: string, island: IslandId, activity: AgentSpec['activity'] = 'idle'): AgentSpec {
  return { key, character: 'sage', name: key, island, slot: 0, activity, preview: true }
}

function run(engine: OfficeEngine, seconds: number, onTick?: () => void) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    engine.tick(1 / 60)
    onTick?.()
  }
}

describe('dunia & navigasi', () => {
  test('semua simpul pulau berada di dalam area jalan', () => {
    for (const island of world.islands.values()) {
      for (const point of [island.spawn, island.hub, island.portal.point, ...island.workstations.map((w) => w.point)]) {
        expect(insidePolygon(point, island.walkable)).toBe(true)
      }
    }
  })

  test('graf portal terhubung: setiap pulau dapat dicapai dari setiap pulau', () => {
    const ids = [...world.islands.keys()]
    for (const from of ids)
      for (const to of ids) if (from !== to) expect(islandPath(world, from, to).length).toBeGreaterThan(0)
  })

  test('rute antar pulau: jalan ke portal → teleport → jalan; tidak ada jalan melintasi udara', () => {
    const from = world.islands.get('knowledge-base')
    const to = world.islands.get('data-warehouse')
    if (!from || !to) throw new Error('pulau tidak ada')
    const route = findRoute(
      world,
      { island: from.id, point: from.spawn },
      { island: to.id, point: to.workstations[0]!.point },
    )
    expect(route[0]?.kind).toBe('walk')
    expect(route.at(-1)?.kind).toBe('walk')
    expect(route.some((leg) => leg.kind === 'teleport')).toBe(true)
    let island: IslandId = from.id
    for (const leg of route) {
      if (leg.kind === 'walk') {
        expect(leg.island).toBe(island)
        const polygon = world.islands.get(leg.island)?.walkable ?? []
        for (const point of leg.points) expect(insidePolygon(point, polygon)).toBe(true)
      } else {
        expect(leg.from).toBe(island)
        expect([leg.link.a, leg.link.b]).toContain(leg.to)
        island = leg.to
      }
    }
    expect(island).toBe('data-warehouse')
  })
})

describe('mesin gerak', () => {
  test('robot berjalan, teleport, lalu berhenti tepat di anchor workstation dan mulai bekerja', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'mission-hub')])
    const events: string[] = []
    engine.on((event) => events.push(event.type === 'teleport' ? `teleport-${event.phase}` : event.type))
    expect(engine.moveTo('sage', { island: 'web-research', slot: 0 }, { state: 'researching' })).toBe(true)
    const agent = engine.agents.get('sage')!
    expect(agent.activity).toBe('moving')
    const animations = new Set<string>()
    const facings = new Set<number>()
    run(engine, 15, () => {
      const state = engine.renderStates()[0]!
      animations.add(state.animation)
      if (state.animation === 'walk') facings.add(state.facing)
      // Saat terlihat & berjalan, robot selalu di atas area jalan pulaunya.
      if (agent.visible && !agent.teleport) {
        expect(insidePolygon(agent.position, world.islands.get(agent.island)!.walkable)).toBe(true)
      }
    })
    const anchor = world.islands.get('web-research')!.workstations[0]!.point
    expect(agent.island).toBe('web-research')
    expect(agent.position.x).toBeCloseTo(anchor.x, 1)
    expect(agent.position.y).toBeCloseTo(anchor.y, 1)
    expect(agent.activity).toBe('researching')
    expect(animations.has('walk')).toBe(true)
    expect(animations.has('teleport')).toBe(true)
    expect(animations.has('read')).toBe(true)
    expect(events).toContain('teleport-in')
    expect(events).toContain('teleport-out')
    expect(events.at(-1)).toBe('arrived')
  })

  test('pembatalan menghentikan robot di tempat (siaga); jeda membekukan gerak', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'web-research')])
    engine.moveTo('sage', { island: 'web-research', slot: 1 })
    run(engine, 0.3)
    const agent = engine.agents.get('sage')!
    const before = { ...agent.position }
    engine.paused = true
    run(engine, 2)
    expect(agent.position).toEqual(before)
    engine.paused = false
    engine.cancel('sage')
    expect(agent.activity).toBe('idle')
    run(engine, 1)
    expect(agent.position).toEqual(before)
  })

  test('reduced motion: tiba seketika tanpa animasi jalan', () => {
    const engine = new OfficeEngine(world, { reducedMotion: true })
    engine.setAgents([spec('sage', 'mission-hub')])
    engine.moveTo('sage', { island: 'analytics-tool' }, { state: 'working' })
    const agent = engine.agents.get('sage')!
    expect(agent.island).toBe('analytics-tool')
    expect(agent.activity).toBe('working')
  })

  test('state machine menolak transisi tidak sah; agent offline tidak bisa digerakkan', () => {
    expect(canTransition('offline', 'working')).toBe(false)
    expect(canTransition('working', 'waiting_approval')).toBe(true)
    expect(canTransition('waiting_approval', 'working')).toBe(true)
    expect(canTransition('working', 'failed')).toBe(true)
    expect(canTransition('failed', 'idle')).toBe(true)
    for (const state of ACTIVITY_STATES) expect(canTransition(state, state)).toBe(true)
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('arka', 'training-center', 'offline')])
    expect(engine.moveTo('arka', { island: 'mission-hub' })).toBe(false)
    expect(engine.setActivity('arka', { state: 'working' })).toBe(false)
  })
})

describe('simulasi Project Atlas', () => {
  test('berjalan dari awal sampai selesai; setiap karakter tiba di workstation tujuannya', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    const phases = new Set<number>()
    const reached = new Map<string, Set<string>>()
    const animations = new Set<string>()
    engine.on((event) => {
      if (event.type === 'activity') reached.set(event.key, (reached.get(event.key) ?? new Set()).add(event.to))
    })
    simulation.start('Lakukan riset pasar Project Atlas')
    for (let elapsed = 0; elapsed < 120 && simulation.status !== 'completed'; elapsed += 1 / 30) {
      engine.tick(1 / 30)
      simulation.update()
      phases.add(simulation.phaseIndex)
      for (const state of engine.renderStates()) animations.add(state.animation)
    }
    expect(simulation.status).toBe('completed')
    // Tidak ada aksi fase yang ditolak diam-diam oleh state machine.
    expect(simulation.rejectedActions).toEqual([])
    for (const phase of ATLAS_PHASES) {
      for (const action of phase.actions)
        expect(reached.get(`preview:${action.actor}`)?.has(action.activity)).toBe(true)
    }
    for (const animation of ['walk', 'teleport', 'communicate', 'think', 'read', 'work', 'celebrate']) {
      expect(animations.has(animation)).toBe(true)
    }
    expect(phases.size).toBeGreaterThanOrEqual(ATLAS_PHASES.length)
    expect(simulation.completedObjectives).toEqual(['collect', 'analyze', 'build', 'deliver'])
    const at = (character: string) => engine.agents.get(`preview:${character}`)!.island
    expect(at('sage')).toBe('web-research')
    expect(at('pixel')).toBe('analytics-tool')
    expect(at('bolt')).toBe('report-builder')
    expect(at('echo')).toBe('data-warehouse')
    expect(at('nova')).toBe('mission-hub')
    for (const agent of engine.agents.values()) expect(agent.activity).toBe('idle')
  })

  test('reduced motion & robot yang sudah di tujuan: simulasi tetap selesai (tidak menggantung)', () => {
    for (const setup of ['reduced-motion', 'already-there'] as const) {
      const engine = new OfficeEngine(world, { reducedMotion: setup === 'reduced-motion' })
      engine.setAgents(atlasAgentSpecs(NAMES))
      if (setup === 'already-there') {
        engine.moveTo('preview:sage', { island: 'web-research' })
        for (let i = 0; i < 600 && engine.agents.get('preview:sage')?.route.length; i += 1) engine.tick(1 / 30)
        expect(engine.agents.get('preview:sage')?.island).toBe('web-research')
      }
      const simulation = new SimulationController(engine)
      simulation.start('Lakukan riset pasar Project Atlas')
      for (let elapsed = 0; elapsed < 120 && simulation.status !== 'completed'; elapsed += 1 / 30) {
        engine.tick(1 / 30)
        simulation.update()
      }
      expect(simulation.status).toBe('completed')
      expect(simulation.rejectedActions).toEqual([])
    }
  })

  test('jeda, lanjut, kecepatan, dan reset', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    simulation.start('riset')
    simulation.pause()
    const time = engine.time
    engine.tick(1)
    expect(engine.time).toBe(time)
    simulation.resume()
    simulation.setSpeed(2)
    engine.tick(0.05)
    expect(engine.time).toBeCloseTo(time + 0.1, 5)
    simulation.reset(NAMES)
    expect(simulation.status).toBe('idle')
    expect(engine.agents.get('preview:sage')?.island).toBe('web-research')
    expect(engine.agents.size).toBe(5)
  })
})

describe('perintah & adaptor live', () => {
  test('instruksi contoh brief dipetakan ke karakter & stasiun yang tepat', () => {
    expect(parsePreviewInstruction('Sage, lakukan riset pasar.', null)).toMatchObject({
      target: 'sage',
      island: 'web-research',
      activity: 'researching',
    })
    expect(parsePreviewInstruction('Pixel, analisis hasil riset Sage.', null)).toMatchObject({
      target: 'pixel',
      island: 'analytics-tool',
    })
    expect(parsePreviewInstruction('Bolt, buat laporan hasil analisis.', null)).toMatchObject({
      target: 'bolt',
      island: 'report-builder',
    })
    expect(parsePreviewInstruction('Nova, koordinasikan pekerjaan seluruh tim.', null)).toMatchObject({
      target: 'nova',
      island: 'mission-hub',
      startsMission: true,
    })
    expect(parsePreviewInstruction('Echo, jalankan tool yang diperlukan.', null)).toMatchObject({
      target: 'echo',
      island: 'data-warehouse',
      activity: 'using_tool',
    })
    expect(parsePreviewInstruction('lakukan riset', 'nova').startsMission).toBe(true)
    expect(parsePreviewInstruction('Echo, minta persetujuan sebelum menjalankan tool.', null)).toMatchObject({
      target: 'echo',
      intent: 'approval',
      island: null,
      activity: 'waiting_approval',
    })
  })

  test('alur persetujuan: setujui → bekerja → selesai (celebrate) → siaga; tolak → gagal (error) → siaga', () => {
    const run = (approved: boolean) => {
      const engine = new OfficeEngine(world)
      engine.setAgents(atlasAgentSpecs(NAMES))
      const states: string[] = []
      const animations = new Set<string>()
      engine.on((event) => {
        if (event.type === 'activity' && event.key === 'preview:echo') states.push(event.to)
      })
      expect(engine.setActivity('preview:echo', { state: 'waiting_approval' })).toBe(true)
      expect(
        approved
          ? engine.setActivity('preview:echo', { state: 'working', seconds: 3, next: 'completed' })
          : engine.setActivity('preview:echo', { state: 'failed', seconds: 2.5, next: 'idle' }),
      ).toBe(true)
      for (let i = 0; i < 30 * 8; i += 1) {
        engine.tick(1 / 30)
        for (const state of engine.renderStates()) if (state.key === 'preview:echo') animations.add(state.animation)
      }
      return { states, animations }
    }
    const approved = run(true)
    expect(approved.states).toEqual(['waiting_approval', 'working', 'completed', 'idle'])
    expect(approved.animations.has('celebrate')).toBe(true)
    const rejected = run(false)
    expect(rejected.states).toEqual(['waiting_approval', 'failed', 'idle'])
    expect(rejected.animations.has('error')).toBe(true)
  })

  test('perintah bisnis tidak didukung di mode live (tidak ada endpoint), perintah visual didukung', () => {
    for (const command of AGENT_COMMANDS) {
      expect(command.live.supported).toBe(command.kind === 'visual')
    }
  })

  test('event SSE nyata dipetakan; status live hanya dari data otoritatif', () => {
    const now = new Date()
    expect(mapRealtimeEvent({ event: 'heartbeat', data: { serverTime: now } })).toEqual([
      { type: 'confirm', serverTime: now },
    ])
    expect(
      mapRealtimeEvent({
        event: 'ready',
        data: { tenantId: 't', connectionId: 'c', serverTime: now, heartbeatIntervalMs: 1000 },
      })[0],
    ).toEqual({ type: 'resync', reason: 'ready' })
    expect(liveActivity('active', null)).toBe('idle')
    expect(liveActivity('paused', null)).toBe('offline')
    const specs = liveAgentSpecs(
      [
        { id: 'a', name: 'Nara', lifecycleStatus: 'active', runtimeStatus: null },
        { id: 'b', name: 'Arka', lifecycleStatus: 'draft', runtimeStatus: null },
        { id: 'c', name: 'Arsip', lifecycleStatus: 'archived', runtimeStatus: null },
      ],
      new Map([
        ['a', { character: 'echo', stationId: 'client-brief', slot: 0 }],
        ['b', { character: 'nova', stationId: 'training-center', slot: 0 }],
      ]),
    )
    expect(specs.map((item) => [item.key, item.activity, item.preview])).toEqual([
      ['a', 'idle', false],
      ['b', 'offline', false],
    ])
  })
})

describe('sprite sheet karakter', () => {
  test('setiap karakter memiliki sheet & atlas yang mengikuti kontrak animasi yang sama', () => {
    for (const character of CHARACTER_KEYS) {
      const directory = join(import.meta.dir, '..', '..', 'public', 'game-assets-v2', 'agents', character)
      expect(existsSync(join(directory, 'sheet.webp'))).toBe(true)
      const atlas = JSON.parse(readFileSync(join(directory, 'atlas.json'), 'utf8'))
      expect(atlas.character).toBe(character)
      expect(atlas.sheet.columns).toBe(AGENT_SHEET.columns)
      expect(atlas.sheet.rows).toBe(AGENT_SHEET.rows)
      for (const [row, name] of ANIMATION_ROWS.entries()) {
        expect(atlas.animations[name].row).toBe(row)
        expect(atlas.animations[name].frames).toHaveLength(AGENT_ANIMATIONS[name].frames)
        expect(atlas.animations[name].fps).toBe(AGENT_ANIMATIONS[name].fps)
      }
    }
  })
})
