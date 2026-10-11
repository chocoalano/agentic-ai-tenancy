import type { InjectionKey, Ref } from 'vue'
import { ACTIVITY_PRESENTATION, type ActivityState } from '~/game/agent-state'
import { createDomRenderer } from '~/game/dom-renderer'
import { OfficeEngine, type ActivityPlan, type AgentSpec, type EngineEvent } from '~/game/engine'
import { SimulationController, atlasAgentSpecs, type SimulationSnapshot } from '~/game/simulation'
import { buildWorld, type IslandId } from '~/game/world'
import { CHARACTERS, type CharacterKey } from '~/utils/game-assets'

/*
 * Jembatan Vue ↔ mesin Virtual Office.
 *
 * - Mesin & dunia dibuat saat setup (server & browser identik → posisi awal
 *   robot ikut di-SSR tanpa hydration mismatch).
 * - SATU loop requestAnimationFrame (hanya di browser) memajukan mesin dan
 *   simulasi, lalu renderer DOM menulis gaya elemen secara langsung — tidak ada
 *   pembaruan reaktif Vue per frame.
 * - `snapshot` (reaktif) hanya diperbarui saat event diskret: perubahan
 *   aktivitas, tiba, ucapan, teleport, daftar agent, simulasi.
 */

export interface OfficeAgentView {
  key: string
  character: CharacterKey
  name: string
  preview: boolean
  island: IslandId
  slot: number | null
  activity: ActivityState
  label: string
  speech: string | null
  moving: boolean
  destination: IslandId | null
  /** Posisi kaki saat snapshot dibuat (posisi awal SSR). */
  x: number
  y: number
  log: string[]
}

export interface OfficeSnapshot {
  agents: OfficeAgentView[]
  activeStations: IslandId[]
  targetedStations: IslandId[]
  portalFlashes: IslandId[]
  simulation: SimulationSnapshot | null
}

export interface OfficeEngineBridge {
  register(key: string, root: HTMLElement, sprite: HTMLElement): void
  unregister(key: string): void
  registerOrb(key: string, element: HTMLElement): void
  unregisterOrb(key: string): void
}

export const OFFICE_ENGINE_BRIDGE: InjectionKey<OfficeEngineBridge> = Symbol('office-engine-bridge')

const CHARACTER_NAMES: Record<CharacterKey, string> = {
  nova: CHARACTERS.nova.name,
  sage: CHARACTERS.sage.name,
  pixel: CHARACTERS.pixel.name,
  bolt: CHARACTERS.bolt.name,
  echo: CHARACTERS.echo.name,
}

function clock(seconds: number): string {
  const total = Math.floor(seconds)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function useOfficeEngine(options: { preview: Ref<boolean>; liveSpecs: Ref<AgentSpec[]> }) {
  const world = buildWorld()
  const engine = new OfficeEngine(world)
  const simulation = new SimulationController(engine)
  const logs = new Map<string, string[]>()
  const flashes = new Map<IslandId, number>()
  const stage = ref<HTMLElement | null>(null)

  function initialSpecs(): AgentSpec[] {
    return options.preview.value ? atlasAgentSpecs(CHARACTER_NAMES) : options.liveSpecs.value
  }
  engine.setAgents(initialSpecs())

  function islandLabel(id: IslandId): string {
    return world.islands.get(id)?.label ?? id
  }

  function appendLog(key: string, text: string) {
    const agent = engine.agents.get(key)
    const prefix = agent?.preview ? 'Simulasi' : 'Visual'
    const list = logs.get(key) ?? []
    list.unshift(`${clock(engine.time)} · ${prefix}: ${text}`)
    logs.set(key, list.slice(0, 6))
  }

  function build(): OfficeSnapshot {
    const agents: OfficeAgentView[] = []
    const active = new Set<IslandId>()
    const targeted = new Set<IslandId>()
    for (const agent of engine.agents.values()) {
      const presentation = ACTIVITY_PRESENTATION[agent.activity]
      if (presentation.workstationActive && agent.route.length === 0) active.add(agent.island)
      if (agent.destination) targeted.add(agent.destination.island)
      agents.push({
        key: agent.key,
        character: agent.character,
        name: agent.name,
        preview: agent.preview,
        island: agent.island,
        slot: agent.slot,
        activity: agent.activity,
        label: presentation.label,
        speech: agent.speech?.text ?? null,
        moving: agent.route.length > 0,
        destination: agent.destination?.island ?? null,
        x: agent.position.x,
        y: agent.position.y,
        log: logs.get(agent.key) ?? [],
      })
    }
    const now = engine.time
    return {
      agents,
      activeStations: [...active],
      targetedStations: [...targeted],
      portalFlashes: [...flashes.entries()].filter(([, until]) => until > now).map(([island]) => island),
      simulation: options.preview.value ? simulation.snapshot() : null,
    }
  }

  const snapshot = shallowRef<OfficeSnapshot>(build())
  const refresh = () => {
    snapshot.value = build()
  }

  engine.on((event: EngineEvent) => {
    if (event.type === 'activity' && event.to !== 'moving') {
      const agent = engine.agents.get(event.key)
      if (agent) appendLog(event.key, `${ACTIVITY_PRESENTATION[event.to].label} di ${islandLabel(agent.island)}`)
    }
    if (event.type === 'route') appendLog(event.key, `Menuju ${islandLabel(event.island)}`)
    if (event.type === 'teleport') {
      flashes.set(event.phase === 'in' ? event.from : event.to, engine.time + 1.1)
      if (event.phase === 'in') appendLog(event.key, `Teleport ${islandLabel(event.from)} → ${islandLabel(event.to)}`)
    }
    if (event.type === 'arrived') appendLog(event.key, `Tiba di ${islandLabel(event.island)}`)
    refresh()
  })
  simulation.onChange(refresh)

  // Renderer DOM (dipanggil dari loop; menulis gaya langsung).
  const renderer = createDomRenderer()
  const bridge: OfficeEngineBridge = {
    register: renderer.register,
    unregister: renderer.unregister,
    registerOrb: renderer.registerOrb,
    unregisterOrb: renderer.unregisterOrb,
  }
  provide(OFFICE_ENGINE_BRIDGE, bridge)

  // Loop tunggal + pengukur performa (FPS ditulis ke data-fps panggung, bukan state Vue).
  let frameHandle = 0
  let previous = 0
  let frames = 0
  let windowStart = 0
  let worstFrame = 0
  let lastFlashCheck = 0

  function loop(now: number) {
    const dt = previous === 0 ? 0 : (now - previous) / 1000
    previous = now
    engine.tick(dt)
    simulation.update()
    renderer.render(engine.renderStates())
    frames += 1
    worstFrame = Math.max(worstFrame, dt)
    if (now - windowStart >= 1000) {
      if (stage.value) {
        stage.value.dataset.fps = String(Math.round((frames * 1000) / (now - windowStart)))
        stage.value.dataset.worstFrameMs = String(Math.round(worstFrame * 1000))
      }
      frames = 0
      worstFrame = 0
      windowStart = now
    }
    // Padamkan kilatan portal yang kedaluwarsa (jarang; bukan per frame).
    if (now - lastFlashCheck > 300 && snapshot.value.portalFlashes.length > 0) {
      lastFlashCheck = now
      if (snapshot.value.portalFlashes.some((island) => (flashes.get(island) ?? 0) <= engine.time)) refresh()
    }
    frameHandle = requestAnimationFrame(loop)
  }

  let motion: MediaQueryList | null = null
  const onMotionChange = (event: MediaQueryListEvent) => {
    engine.reducedMotion = event.matches
  }
  onMounted(() => {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    engine.reducedMotion = motion.matches
    motion.addEventListener('change', onMotionChange)
    windowStart = performance.now()
    frameHandle = requestAnimationFrame(loop)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(frameHandle)
    motion?.removeEventListener('change', onMotionChange)
  })

  // Pergantian mode / data live.
  watch(options.preview, () => {
    simulation.reset(CHARACTER_NAMES)
    engine.setAgents([])
    engine.setAgents(initialSpecs())
    logs.clear()
    refresh()
  })
  watch(options.liveSpecs, (specs) => {
    if (!options.preview.value) engine.setAgents(specs)
  })

  return {
    world,
    engine,
    snapshot,
    stage,
    moveTo(key: string, island: IslandId, then?: ActivityPlan) {
      return engine.moveTo(key, { island }, then)
    },
    setActivity(key: string, plan: ActivityPlan) {
      return engine.setActivity(key, plan)
    },
    say(key: string, text: string, seconds?: number) {
      engine.say(key, text, seconds)
    },
    startSimulation(task: string) {
      if (simulation.status === 'completed') simulation.reset(CHARACTER_NAMES)
      simulation.start(task)
    },
    pauseSimulation: () => simulation.pause(),
    resumeSimulation: () => simulation.resume(),
    pauseActor: (key: string) => simulation.pauseActor(key),
    resumeActor: (key: string) => simulation.resumeActor(key),
    resetSimulation: () => {
      simulation.reset(CHARACTER_NAMES)
      logs.clear()
      refresh()
    },
    setSpeed: (speed: number) => simulation.setSpeed(speed),
  }
}
