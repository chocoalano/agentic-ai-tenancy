import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVITY_STATES, canTransition, liveActivity } from '../../app/game/agent-state'
import { AGENT_ANIMATIONS, AGENT_SHEET, ANIMATION_ROWS } from '../../app/game/animation-spec'
import { AGENT_COMMANDS, parsePreviewInstruction } from '../../app/game/commands'
import {
  OfficeEngine,
  STRIDE_UNITS,
  headingOf,
  phaseOffsetFor,
  type AgentSpec,
  type EngineEvent,
  type Heading,
} from '../../app/game/engine'
import { liveAgentSpecs, mapRealtimeEvent } from '../../app/game/live-adapter'
import { findRoute, islandPath } from '../../app/game/navigation'
import { ATLAS_PHASES, ATLAS_START, SimulationController, atlasAgentSpecs } from '../../app/game/simulation'
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
      for (const point of [
        island.spawn,
        island.hub,
        island.portal.entry,
        island.portal.exit,
        ...island.workstations.map((w) => w.point),
      ]) {
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

  test('animasi teleport: masuk diputar maju (0→7), keluar diputar MUNDUR (7→0) dengan frame yang berubah', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'mission-hub')])
    expect(engine.moveTo('sage', { island: 'web-research' })).toBe(true)
    const inFrames: number[] = []
    const outFrames: number[] = []
    for (let i = 0; i < 30 * 15 && engine.agents.get('sage')?.route.length; i += 1) {
      engine.tick(1 / 30)
      const agent = engine.agents.get('sage')
      const state = engine.renderStates().find((item) => item.key === 'sage')
      if (agent?.teleport?.phase === 'in' && state) inFrames.push(state.frame)
      if (agent?.teleport?.phase === 'out' && state) outFrames.push(state.frame)
    }
    expect(inFrames[0]).toBe(0)
    expect(Math.max(...inFrames)).toBe(AGENT_ANIMATIONS.teleport.frames - 1)
    expect(outFrames[0]).toBe(AGENT_ANIMATIONS.teleport.frames - 1)
    expect(outFrames[outFrames.length - 1]).toBe(0)
    for (let i = 1; i < outFrames.length; i += 1) expect(outFrames[i]).toBeLessThanOrEqual(outFrames[i - 1] as number)
    expect(new Set(outFrames).size).toBeGreaterThan(3)
  })

  test('reduced motion: animasi non-loop (celebrate, error) diam di frame 0; state tetap berubah', () => {
    const engine = new OfficeEngine(world, { reducedMotion: true })
    engine.setAgents([spec('sage', 'mission-hub')])
    engine.setActivity('sage', { state: 'completed', seconds: 2, next: 'idle' })
    const frames = new Set<number>()
    for (let i = 0; i < 30; i += 1) {
      engine.tick(1 / 30)
      frames.add(engine.renderStates().find((item) => item.key === 'sage')?.frame ?? -1)
    }
    expect([...frames]).toEqual([0])
    engine.setActivity('sage', { state: 'failed', seconds: 1, next: 'idle' })
    for (let i = 0; i < 20; i += 1) {
      engine.tick(1 / 30)
      expect(engine.renderStates().find((item) => item.key === 'sage')?.frame).toBe(0)
    }
    for (let i = 0; i < 60; i += 1) engine.tick(1 / 30)
    expect(engine.agents.get('sage')?.activity).toBe('idle')
  })

  test('state machine menolak transisi tidak sah; agent offline tidak bisa digerakkan', () => {
    expect(canTransition('offline', 'working')).toBe(false)
    expect(canTransition('working', 'waiting_approval')).toBe(true)
    expect(canTransition('waiting_approval', 'working')).toBe(true)
    expect(canTransition('working', 'failed')).toBe(true)
    expect(canTransition('failed', 'idle')).toBe(true)
    for (const state of ACTIVITY_STATES) expect(canTransition(state, state)).toBe(true)
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('arka', 'task-manager', 'offline')])
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

  /** Jalankan simulasi sampai `predicate` benar (atau selesai/batas waktu). */
  function runUntil(
    engine: OfficeEngine,
    simulation: SimulationController,
    predicate: () => boolean,
    seconds = 120,
  ): boolean {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) {
      if (predicate()) return true
      if (simulation.status === 'completed') return false
      engine.tick(1 / 30)
      simulation.update()
    }
    return predicate()
  }
  const finish = (engine: OfficeEngine, simulation: SimulationController) =>
    runUntil(engine, simulation, () => simulation.status === 'completed', 180)

  test('posisi awal ≠ tujuan fase: kelima robot benar-benar berjalan (event route) lalu tiba di tujuannya', () => {
    const destinations: Record<string, IslandId> = {}
    for (const phase of ATLAS_PHASES)
      for (const action of phase.actions) if (action.moveTo) destinations[action.actor] = action.moveTo
    for (const start of ATLAS_START) {
      const target = destinations[start.character]
      expect([start.character, target !== undefined && target !== start.island]).toEqual([start.character, true])
    }
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const routes = new Map<string, number>()
    const teleports = new Map<string, number>()
    engine.on((event) => {
      if (event.type === 'route') routes.set(event.key, (routes.get(event.key) ?? 0) + 1)
      if (event.type === 'teleport' && event.phase === 'in')
        teleports.set(event.key, (teleports.get(event.key) ?? 0) + 1)
    })
    const simulation = new SimulationController(engine)
    simulation.start('riset')
    expect(finish(engine, simulation)).toBe(true)
    for (const character of ['nova', 'sage', 'pixel', 'bolt', 'echo']) {
      expect([character, routes.get(`preview:${character}`) ?? 0]).not.toEqual([character, 0])
      expect([character, teleports.get(`preview:${character}`) ?? 0]).not.toEqual([character, 0])
      const destination = destinations[character]
      if (!destination) throw new Error(`${character} tidak punya tujuan fase`)
      expect(engine.agents.get(`preview:${character}`)?.island).toBe(destination)
    }
    expect(simulation.rejectedActions).toEqual([])
  })

  test('jeda robot saat berjalan lalu lanjutkan: rencana ditahan (tidak selesai diam-diam) dan simulasi tuntas', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    simulation.start('riset')
    const sage = () => engine.agents.get('preview:sage')
    expect(runUntil(engine, simulation, () => (sage()?.route.length ?? 0) > 0 && sage()?.teleport === null)).toBe(true)
    expect(simulation.pauseActor('preview:sage')).toBe(true)
    expect(sage()?.activity).toBe('idle')
    expect(sage()?.route).toEqual([])
    const phase = simulation.phaseIndex
    // 20 detik berlalu: fase tidak maju (ditahan), status tetap running, bukan menggantung tanpa jalan keluar.
    for (let i = 0; i < 30 * 20; i += 1) {
      engine.tick(1 / 30)
      simulation.update()
    }
    expect(simulation.phaseIndex).toBe(phase)
    expect(simulation.status).toBe('running')
    expect(simulation.snapshot().heldActors).toEqual(['preview:sage'])
    expect(simulation.resumeActor('preview:sage')).toBe(true)
    expect(simulation.snapshot().heldActors).toEqual([])
    expect(finish(engine, simulation)).toBe(true)
    expect(sage()?.island).toBe('web-research')
    expect(simulation.rejectedActions).toEqual([])
  })

  test('jeda saat transit teleport: teleport diselesaikan di portal, rencana ditahan, lanjut → tiba di tujuan', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    simulation.start('riset')
    const sage = () => engine.agents.get('preview:sage')
    expect(runUntil(engine, simulation, () => sage()?.teleport?.phase === 'transit')).toBe(true)
    simulation.pauseActor('preview:sage')
    expect(runUntil(engine, simulation, () => sage()?.teleport === null && (sage()?.route.length ?? 0) === 0)).toBe(
      true,
    )
    expect(sage()?.visible).toBe(true)
    expect(simulation.snapshot().heldActors).toContain('preview:sage')
    for (let i = 0; i < 30 * 5; i += 1) {
      engine.tick(1 / 30)
      simulation.update()
    }
    expect(simulation.status).toBe('running')
    simulation.resumeActor('preview:sage')
    expect(finish(engine, simulation)).toBe(true)
    expect(sage()?.island).toBe('web-research')
  })

  test('jeda saat bekerja lalu lanjutkan: aktivitas diterbitkan ulang dengan durasi penuh, simulasi tuntas', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    simulation.start('riset')
    const sage = () => engine.agents.get('preview:sage')
    expect(runUntil(engine, simulation, () => sage()?.activity === 'researching')).toBe(true)
    simulation.pauseActor('preview:sage')
    expect(sage()?.activity).toBe('idle')
    const phase = simulation.phaseIndex
    for (let i = 0; i < 30 * 15; i += 1) {
      engine.tick(1 / 30)
      simulation.update()
    }
    expect(simulation.phaseIndex).toBe(phase)
    simulation.resumeActor('preview:sage')
    expect(sage()?.activity).toBe('researching')
    expect(finish(engine, simulation)).toBe(true)
  })

  test('jeda saat siaga (tanpa rencana): lanjutkan mengembalikan false, tidak mengubah apa pun', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    expect(simulation.pauseActor('preview:bolt')).toBe(true)
    expect(simulation.resumeActor('preview:bolt')).toBe(false)
    expect(simulation.pauseActor('tidak-ada')).toBe(false)
  })

  test('reset saat bergerak dan saat dijeda: kembali ke posisi awal, lalu bisa dijalankan lagi sampai selesai', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    const startPositions = new Map([...engine.agents.values()].map((agent) => [agent.key, { ...agent.position }]))
    simulation.start('riset')
    expect(runUntil(engine, simulation, () => (engine.agents.get('preview:sage')?.route.length ?? 0) > 0)).toBe(true)
    simulation.reset(NAMES)
    expect(simulation.status).toBe('idle')
    for (const agent of engine.agents.values()) {
      const start = startPositions.get(agent.key)
      if (!start) throw new Error(`posisi awal ${agent.key} tidak tercatat`)
      expect(agent.position).toEqual(start)
      expect(agent.route).toEqual([])
      expect(agent.activity).toBe('idle')
    }
    simulation.start('riset')
    expect(runUntil(engine, simulation, () => (engine.agents.get('preview:sage')?.route.length ?? 0) > 0)).toBe(true)
    simulation.pause()
    simulation.pauseActor('preview:sage')
    simulation.reset(NAMES)
    expect(simulation.status).toBe('idle')
    expect(engine.paused).toBe(false)
    simulation.start('riset')
    expect(finish(engine, simulation)).toBe(true)
    expect(simulation.rejectedActions).toEqual([])
  })

  test('siklus jeda/lanjut berulang (per robot dan global) tetap tuntas tanpa menggantung', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    const simulation = new SimulationController(engine)
    simulation.start('riset')
    let cycles = 0
    for (let elapsed = 0; elapsed < 400 && simulation.status !== 'completed'; elapsed += 1 / 30) {
      engine.tick(1 / 30)
      simulation.update()
      // Setiap ~1,5 dtk: jeda semua robot yang sedang bergerak/bekerja, tunggu 0,5 dtk, lanjutkan; plus jeda global.
      if (Math.round(elapsed * 30) % 45 === 0 && cycles < 12) {
        cycles += 1
        const keys = [...engine.agents.keys()]
        for (const key of keys) simulation.pauseActor(key)
        simulation.pause()
        for (let i = 0; i < 15; i += 1) {
          engine.tick(1 / 30)
          simulation.update()
        }
        simulation.resume()
        for (const key of keys) simulation.resumeActor(key)
      }
    }
    expect(cycles).toBeGreaterThanOrEqual(10)
    expect(simulation.status).toBe('completed')
    expect(simulation.rejectedActions).toEqual([])
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
    expect(engine.agents.get('preview:sage')?.island).toBe(
      ATLAS_START.find((start) => start.character === 'sage')?.island ?? 'mission-hub',
    )
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
        ['b', { character: 'nova', stationId: 'task-manager', slot: 0 }],
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

describe('penerimaan perintah, langkah berbasis jarak, arah hadap, offset fase', () => {
  test('perintah dengan jeda penerimaan: siaga → menerima (thinking) → berangkat → tiba dengan rencana', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'mission-hub')])
    const events: EngineEvent[] = []
    engine.on((event) => events.push(event))
    expect(
      engine.moveTo('sage', { island: 'web-research' }, { state: 'researching' }, { acknowledgeSeconds: 0.7 }),
    ).toBe(true)
    const agent = engine.agents.get('sage')
    if (!agent) throw new Error('agent hilang')
    expect(agent.activity).toBe('thinking')
    expect(agent.route).toEqual([])
    expect(agent.destination?.island).toBe('web-research')
    expect(engine.renderStates()[0]?.acknowledging).toBe(true)
    expect(events.map((event) => event.type)).toEqual(['activity', 'acknowledge'])
    run(engine, 0.5)
    expect(agent.route).toEqual([])
    run(engine, 0.3)
    expect(agent.activity).toBe('moving')
    expect(agent.route.length).toBeGreaterThan(0)
    expect(events.some((event) => event.type === 'route')).toBe(true)
    expect(engine.renderStates()[0]?.acknowledging).toBe(false)
    run(engine, 25)
    expect(agent.island).toBe('web-research')
    expect(agent.activity).toBe('researching')
  })

  test('pembatalan atau aktivitas baru saat menerima perintah membuang perintah itu (tidak pernah berangkat)', () => {
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('a', 'mission-hub'), spec('b', 'mission-hub')])
    engine.moveTo('a', { island: 'web-research' }, { state: 'researching' }, { acknowledgeSeconds: 0.7 })
    engine.cancel('a')
    const a = engine.agents.get('a')
    expect(a?.activity).toBe('idle')
    expect(a?.destination).toBeNull()
    engine.moveTo('b', { island: 'web-research' }, { state: 'researching' }, { acknowledgeSeconds: 0.7 })
    expect(engine.setActivity('b', { state: 'working' })).toBe(true)
    run(engine, 3)
    expect(a?.island).toBe('mission-hub')
    expect(a?.route).toEqual([])
    const b = engine.agents.get('b')
    expect(b?.island).toBe('mission-hub')
    expect(b?.activity).toBe('working')
    expect(b?.route).toEqual([])
  })

  test('tanpa jeda penerimaan: reduced motion tiba seketika; robot yang sudah bergerak langsung dialihkan', () => {
    const reduced = new OfficeEngine(world, { reducedMotion: true })
    reduced.setAgents([spec('sage', 'mission-hub')])
    reduced.moveTo('sage', { island: 'web-research' }, { state: 'researching' }, { acknowledgeSeconds: 0.7 })
    expect(reduced.agents.get('sage')?.island).toBe('web-research')
    expect(reduced.agents.get('sage')?.activity).toBe('researching')

    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'mission-hub')])
    engine.moveTo('sage', { island: 'web-research' })
    run(engine, 0.5)
    engine.moveTo('sage', { island: 'client-brief' }, { state: 'communicating' }, { acknowledgeSeconds: 0.7 })
    const agent = engine.agents.get('sage')
    expect(agent?.activity).toBe('moving')
    expect(agent?.destination?.island).toBe('client-brief')
    expect(engine.renderStates()[0]?.acknowledging).toBe(false)
  })

  test('frame jalan mengikuti jarak tempuh, bukan jam: sama pada kecepatan 1× dan 2×; jeda membekukan frame', () => {
    for (const speed of [1, 2]) {
      const engine = new OfficeEngine(world)
      engine.speed = speed
      engine.setAgents([spec('sage', 'knowledge-base')])
      engine.moveTo('sage', { island: 'report-builder' })
      const agent = engine.agents.get('sage')
      if (!agent) throw new Error('agent hilang')
      const frames = new Set<number>()
      for (let frame = 0; frame < 60 * 20 && agent.route.length > 0; frame += 1) {
        engine.tick(1 / 60)
        const [state] = engine.renderStates()
        if (state?.animation !== 'walk') continue
        const expected =
          Math.floor((agent.walked / STRIDE_UNITS) * AGENT_ANIMATIONS.walk.frames) % AGENT_ANIMATIONS.walk.frames
        expect(state.frame).toBe(expected)
        frames.add(state.frame)
      }
      expect(frames.size).toBe(AGENT_ANIMATIONS.walk.frames)
    }
    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'knowledge-base')])
    engine.moveTo('sage', { island: 'report-builder' })
    run(engine, 0.4)
    const before = engine.renderStates()[0]?.frame
    engine.paused = true
    run(engine, 1)
    expect(engine.renderStates()[0]?.frame).toBe(before)
  })

  test('arah hadap isometrik dari vektor gerak (kiri/kanan/menghadap/membelakangi) dan reset saat keluar portal', () => {
    expect(headingOf(10, 0, 'toward')).toBe('right')
    expect(headingOf(-10, 1, 'toward')).toBe('left')
    expect(headingOf(1, 10, 'right')).toBe('toward')
    expect(headingOf(1, -10, 'right')).toBe('away')
    expect(headingOf(10, 6, 'away')).toBe('right')
    expect(headingOf(0.1, 0.1, 'left')).toBe('left')

    const engine = new OfficeEngine(world)
    engine.setAgents([spec('sage', 'knowledge-base')])
    engine.moveTo('sage', { island: 'data-warehouse' })
    const agent = engine.agents.get('sage')
    if (!agent) throw new Error('agent hilang')
    const seen = new Set<Heading>()
    const exit: { heading: Heading | null } = { heading: null }
    engine.on((event) => {
      if (event.type === 'teleport' && event.phase === 'out') exit.heading = agent.heading
    })
    for (let frame = 0; frame < 60 * 30 && agent.route.length > 0; frame += 1) {
      engine.tick(1 / 60)
      const [state] = engine.renderStates()
      if (state) {
        expect(state.heading).toBe(agent.heading)
        if (state.animation === 'walk') seen.add(state.heading)
        // Cermin horizontal hanya mengikuti komponen x gerak.
        if (state.animation === 'walk' && state.heading === 'left') expect(state.facing).toBe(-1)
        if (state.animation === 'walk' && state.heading === 'right') expect(state.facing).toBe(1)
      }
    }
    expect(seen.size).toBeGreaterThan(0)
    for (const heading of seen) expect(['left', 'right', 'toward', 'away']).toContain(heading)
    expect(exit.heading).toBe('toward')
  })

  test('offset fase deterministik per agent: animasi siaga kelima robot tidak serempak', () => {
    expect(phaseOffsetFor('preview:nova')).toBe(phaseOffsetFor('preview:nova'))
    const offsets = atlasAgentSpecs(NAMES).map((item) => phaseOffsetFor(item.key))
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(1.5)
    }
    expect(new Set(offsets.map((offset) => Math.round(offset * 100))).size).toBeGreaterThanOrEqual(3)
    const engine = new OfficeEngine(world)
    engine.setAgents(atlasAgentSpecs(NAMES))
    run(engine, 0.05)
    const frames = engine.renderStates().map((state) => state.frame)
    expect(new Set(frames).size).toBeGreaterThan(1)
    // Reduced motion: offset tidak membuat frame bergeser dari 0.
    const still = new OfficeEngine(world, { reducedMotion: true })
    still.setAgents(atlasAgentSpecs(NAMES))
    run(still, 0.05)
    for (const state of still.renderStates()) expect(state.frame).toBe(0)
  })
})
