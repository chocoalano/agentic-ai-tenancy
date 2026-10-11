import { describe, expect, test } from 'bun:test'
import { AMBIENT_BEHAVIOURS, AmbientScheduler, type AmbientBehaviourId } from '../../app/game/ambient'
import { OfficeEngine, type AgentSpec, type EngineEvent } from '../../app/game/engine'
import { ATLAS_PHASES, SimulationController, atlasAgentSpecs } from '../../app/game/simulation'
import { buildWorld, type IslandId } from '../../app/game/world'

const world = buildWorld()
const NAMES = { nova: 'Nova', sage: 'Sage', pixel: 'Pixel', bolt: 'Bolt', echo: 'Echo' } as const

interface Started {
  time: number
  key: string
  id: AmbientBehaviourId
}

function setup(options: { seed?: string; reducedMotion?: boolean; specs?: AgentSpec[] } = {}) {
  const engine = new OfficeEngine(world, { reducedMotion: options.reducedMotion })
  engine.setAgents(options.specs ?? atlasAgentSpecs(NAMES))
  const ambient = new AmbientScheduler(engine, { seed: options.seed })
  const events: EngineEvent[] = []
  engine.on((event) => events.push(event))
  return { engine, ambient, events }
}

/** Majukan mesin + penjadwal `seconds` detik, mencatat setiap overlay yang MULAI dan jumlah overlay serentak maksimum. */
function run(ctx: ReturnType<typeof setup>, seconds: number, onTick?: () => void) {
  const started: Started[] = []
  // Overlay yang sudah berjalan sebelum pengukuran tidak dihitung sebagai "mulai".
  const active = new Map<string, string>()
  for (const state of ctx.engine.renderStates()) if (state.ambient) active.set(state.key, state.ambient)
  let maxConcurrent = 0
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) {
    ctx.engine.tick(1 / 30)
    ctx.ambient.update()
    onTick?.()
    let concurrent = 0
    for (const state of ctx.engine.renderStates()) {
      if (!state.ambient) {
        active.delete(state.key)
        continue
      }
      concurrent += 1
      if (active.get(state.key) !== state.ambient) {
        active.set(state.key, state.ambient)
        const id = AMBIENT_BEHAVIOURS.find((item) => item.id === state.ambient)?.id
        if (id) started.push({ time: Math.round(ctx.engine.time * 100) / 100, key: state.key, id })
      }
    }
    maxConcurrent = Math.max(maxConcurrent, concurrent)
  }
  return { started, maxConcurrent }
}

describe('penjadwal ambient', () => {
  test('deterministik: benih sama → urutan perilaku identik; benih lain → berbeda', () => {
    const a = run(setup({ seed: 'qa' }), 90)
    const b = run(setup({ seed: 'qa' }), 90)
    const c = run(setup({ seed: 'lain' }), 90)
    expect(a.started.length).toBeGreaterThan(5)
    expect(a.started).toEqual(b.started)
    expect(c.started).not.toEqual(a.started)
  })

  test('semua robot siaga ikut hidup, tidak serempak, dan variasi perilaku > 1', () => {
    const result = run(setup(), 120)
    const keys = new Set(result.started.map((item) => item.key))
    expect(keys.size).toBe(5)
    expect(result.maxConcurrent).toBeLessThanOrEqual(2)
    expect(new Set(result.started.map((item) => item.id)).size).toBeGreaterThan(1)
  })

  test('ambient tidak menyentuh state machine, posisi, maupun log: nol event aktivitas/rute selama 120 detik siaga', () => {
    const ctx = setup()
    const before = [...ctx.engine.agents.values()].map((agent) => ({ ...agent.position }))
    run(ctx, 120)
    expect(ctx.events.filter((event) => event.type === 'activity' || event.type === 'route')).toEqual([])
    for (const agent of ctx.engine.agents.values()) expect(agent.activity).toBe('idle')
    expect([...ctx.engine.agents.values()].map((agent) => ({ ...agent.position }))).toEqual(before)
  })

  test('overlay memengaruhi render saja: menoleh membalik arah hadap, merenung memutar animasi think', () => {
    const ctx = setup()
    const seen = new Map<string, { animation: string; facing: number }>()
    run(ctx, 150, () => {
      for (const state of ctx.engine.renderStates()) if (state.ambient) seen.set(state.ambient, state)
    })
    expect(seen.get('glance')?.facing).toBe(-1)
    expect(seen.get('ponder')?.animation).toBe('think')
    expect(seen.get('inspect')?.animation).toBe('read')
    // Tanpa overlay, robot siaga menghadap kanan (arah default sheet).
    for (const state of ctx.engine.renderStates()) if (!state.ambient) expect(state.facing).toBe(1)
  })

  test('hanya robot pratinjau yang siaga: agent live dan robot yang bekerja tidak pernah mendapat overlay', () => {
    const specs: AgentSpec[] = [
      {
        key: 'live-1',
        character: 'nova',
        name: 'Live',
        island: 'client-brief',
        slot: 0,
        activity: 'idle',
        preview: false,
      },
      {
        key: 'preview:busy',
        character: 'sage',
        name: 'Busy',
        island: 'web-research',
        slot: 0,
        activity: 'working',
        preview: true,
      },
      {
        key: 'preview:free',
        character: 'pixel',
        name: 'Free',
        island: 'analytics-tool',
        slot: 0,
        activity: 'idle',
        preview: true,
      },
    ]
    const result = run(setup({ specs }), 120)
    expect(new Set(result.started.map((item) => item.key))).toEqual(new Set(['preview:free']))
  })

  test('prioritas: perintah pengguna langsung mengalahkan overlay; saat bergerak/bekerja tidak ada ambient', () => {
    const ctx = setup()
    // Jalankan sampai ada overlay aktif.
    let key = ''
    for (let frame = 0; frame < 30 * 120 && !key; frame += 1) {
      ctx.engine.tick(1 / 30)
      ctx.ambient.update()
      key = ctx.engine.renderStates().find((state) => state.ambient)?.key ?? ''
    }
    expect(key).not.toBe('')
    expect(
      ctx.engine.moveTo(key, { island: 'mission-hub' }, { state: 'communicating' }, { acknowledgeSeconds: 0.7 }),
    ).toBe(true)
    const state = ctx.engine.renderStates().find((item) => item.key === key)
    expect(state?.ambient).toBeNull()
    expect(state?.acknowledging).toBe(true)
    const travel = run(ctx, 12)
    expect(travel.started.filter((item) => item.key === key)).toEqual([])
    expect(ctx.engine.agents.get(key)?.island).toBe('mission-hub')
  })

  test('jeda membekukan ambient (jam mesin berhenti); lanjut → berjalan lagi', () => {
    const ctx = setup()
    const before = run(ctx, 40)
    ctx.engine.paused = true
    const paused = run(ctx, 40)
    expect(paused.started).toEqual([])
    ctx.engine.paused = false
    const after = run(ctx, 40)
    expect(before.started.length + after.started.length).toBeGreaterThan(before.started.length)
  })

  test('reduced motion: tidak ada overlay maupun hologram pulau ambient', () => {
    const ctx = setup({ reducedMotion: true })
    const result = run(ctx, 120)
    expect(result.started).toEqual([])
    expect(ctx.ambient.snapshot()).toEqual({ agents: {}, islands: [] })
  })

  test('hologram pulau: menyala di pulau yang tidak dipakai, padam setelah durasinya, pendengar diberi tahu', () => {
    const ctx = setup()
    let notified = 0
    ctx.ambient.onChange(() => (notified += 1))
    const lit = new Set<IslandId>()
    let longest = 0
    let current: IslandId | null = null
    let since = 0
    run(ctx, 120, () => {
      const [island] = ctx.ambient.snapshot().islands
      if (island !== current) {
        if (current) longest = Math.max(longest, ctx.engine.time - since)
        current = island ?? null
        since = ctx.engine.time
      }
      if (island) lit.add(island)
    })
    expect(lit.size).toBeGreaterThan(1)
    expect(notified).toBeGreaterThan(2)
    expect(longest).toBeLessThan(3.2)
    for (const island of lit) expect(world.islands.has(island)).toBe(true)
  })

  test('tidak mengganggu misi Project Atlas: skenario tetap tuntas dengan tujuan yang sama dan tanpa aksi ditolak', () => {
    const ctx = setup()
    const simulation = new SimulationController(ctx.engine)
    simulation.start('Lakukan riset pasar Project Atlas')
    for (let elapsed = 0; elapsed < 120 && simulation.status !== 'completed'; elapsed += 1 / 30) {
      ctx.engine.tick(1 / 30)
      simulation.update()
      ctx.ambient.update()
    }
    expect(simulation.status).toBe('completed')
    expect(simulation.rejectedActions).toEqual([])
    expect(simulation.completedObjectives).toHaveLength(ATLAS_PHASES.filter((phase) => phase.objective).length)
    const at = (character: string) => ctx.engine.agents.get(`preview:${character}`)?.island
    expect([at('sage'), at('pixel'), at('bolt'), at('echo'), at('nova')]).toEqual([
      'web-research',
      'analytics-tool',
      'report-builder',
      'data-warehouse',
      'mission-hub',
    ])
  })

  test('clear/dispose melepas overlay & hologram; dinonaktifkan → tidak ada perilaku baru', () => {
    const ctx = setup()
    run(ctx, 60)
    ctx.ambient.clear()
    for (const state of ctx.engine.renderStates()) expect(state.ambient).toBeNull()
    expect(ctx.ambient.snapshot().islands).toEqual([])
    ctx.ambient.enabled = false
    expect(run(ctx, 60).started).toEqual([])
    ctx.ambient.dispose()
    expect(run(ctx, 30).started).toEqual([])
  })
})
