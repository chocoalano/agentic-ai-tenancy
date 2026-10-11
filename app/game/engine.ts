import type { CharacterKey } from '../utils/game-assets'
import { ACTIVITY_PRESENTATION, canTransition, type ActivityState } from './agent-state'
import { AGENT_ANIMATIONS, type AgentAnimationName } from './animation-spec'
import { findRoute, type RouteLeg, type TeleportLeg } from './navigation'
import type { IslandId, Point, World } from './world'

/*
 * Mesin Virtual Office (murni, tanpa Vue/DOM).
 *
 * - Satu jam simulasi (`time`, detik) yang dapat dijeda & dipercepat.
 * - Per agent: posisi kaki (unit dunia), arah hadap, aktivitas (state
 *   machine), rute (leg jalan/teleport), animasi + frame, ucapan.
 * - `tick(dt)` dipanggil dari SATU loop requestAnimationFrame milik pemanggil;
 *   hasilnya dibaca renderer lewat `renderStates()` tanpa reaktivitas Vue.
 * - Perubahan diskret (aktivitas, tiba, ucapan, mulai teleport) dikirim
 *   sebagai event agar UI Vue hanya diperbarui saat perlu.
 */

export interface AgentSpec {
  key: string
  character: CharacterKey
  name: string
  island: IslandId
  slot: number
  activity: ActivityState
  preview: boolean
}

export interface ActivityPlan {
  state: ActivityState
  /** Durasi (detik simulasi); setelahnya pindah ke `next` (default: tetap). */
  seconds?: number
  next?: ActivityState
}

interface TeleportRun {
  leg: TeleportLeg
  phase: 'in' | 'transit' | 'out'
  started: number
  from: Point
  to: Point
}

export interface AgentRuntime {
  key: string
  character: CharacterKey
  name: string
  preview: boolean
  position: Point
  island: IslandId
  slot: number | null
  facing: 1 | -1
  activity: ActivityState
  activityStarted: number
  activityUntil: number | null
  activityNext: ActivityState | null
  route: RouteLeg[]
  legIndex: number
  legDistance: number
  teleport: TeleportRun | null
  destination: { island: IslandId; slot: number | null } | null
  onArrive: ActivityPlan | null
  speech: { text: string; until: number } | null
  animationStarted: number
  lastAnimation: AgentAnimationName
  orb: Point | null
  visible: boolean
}

export interface AgentRenderState {
  key: string
  x: number
  y: number
  facing: 1 | -1
  animation: AgentAnimationName
  frame: number
  visible: boolean
  depth: number
  orb: Point | null
}

export type EngineEvent =
  | { type: 'activity'; key: string; from: ActivityState; to: ActivityState }
  | { type: 'arrived'; key: string; island: IslandId; slot: number | null }
  | { type: 'route'; key: string; island: IslandId; slot: number | null }
  | { type: 'teleport'; key: string; from: IslandId; to: IslandId; phase: 'in' | 'out' }
  | { type: 'speech'; key: string }
  | { type: 'agents' }
  | { type: 'clock' }

export interface EngineOptions {
  reducedMotion?: boolean
  /** Kecepatan jalan maksimum (unit dunia / detik simulasi). */
  walkSpeed?: number
}

const TELEPORT_IN = AGENT_ANIMATIONS.teleport.frames / AGENT_ANIMATIONS.teleport.fps
const TELEPORT_TRANSIT = 0.6
const ACCEL_DISTANCE = 36
const MIN_SPEED_RATIO = 0.25
/** Lama state `completed` (animasi celebrate) sebelum kembali siaga, detik. */
const COMPLETED_HOLD = 2

function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

function legLength(points: readonly Point[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    if (a && b) total += distance(a, b)
  }
  return total
}

/** Titik pada polyline setelah menempuh `s` unit; juga arah segmen. */
function pointAlong(points: readonly Point[], s: number): { point: Point; dx: number } {
  let remaining = s
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    if (!a || !b) continue
    const length = distance(a, b)
    if (remaining <= length || index === points.length - 1) {
      const t = length === 0 ? 1 : Math.min(1, remaining / length)
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dx: b.x - a.x }
    }
    remaining -= length
  }
  const last = points[points.length - 1] ?? { x: 0, y: 0 }
  return { point: last, dx: 0 }
}

function quadratic(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  }
}

export class OfficeEngine {
  readonly world: World
  time = 0
  speed = 1
  paused = false
  reducedMotion: boolean
  readonly agents = new Map<string, AgentRuntime>()
  private readonly walkSpeed: number
  private readonly listeners = new Set<(event: EngineEvent) => void>()

  constructor(world: World, options: EngineOptions = {}) {
    this.world = world
    this.reducedMotion = options.reducedMotion ?? false
    this.walkSpeed = options.walkSpeed ?? 95
  }

  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: EngineEvent) {
    for (const listener of this.listeners) listener(event)
  }

  /** Titik workstation (atau spawn bila slot tidak ada). */
  stationPoint(island: IslandId, slot: number | null): Point {
    const target = this.world.islands.get(island)
    if (!target) return { x: 0, y: 0 }
    if (slot === null) return target.spawn
    return target.workstations[slot]?.point ?? target.spawn
  }

  /** Slot kosong pertama di pulau (mengabaikan agent `except`). */
  freeSlot(island: IslandId, except?: string): number | null {
    const total = this.world.islands.get(island)?.workstations.length ?? 0
    const taken = new Set<number>()
    for (const agent of this.agents.values()) {
      if (agent.key === except) continue
      const owner = agent.destination ?? { island: agent.island, slot: agent.slot }
      if (owner.island === island && owner.slot !== null) taken.add(owner.slot)
    }
    for (let slot = 0; slot < total; slot += 1) if (!taken.has(slot)) return slot
    return null
  }

  /** Sinkronkan daftar agent (agent lama mempertahankan posisi & state geraknya). */
  setAgents(specs: readonly AgentSpec[]) {
    const keep = new Set(specs.map((spec) => spec.key))
    for (const key of this.agents.keys()) if (!keep.has(key)) this.agents.delete(key)
    for (const spec of specs) {
      const existing = this.agents.get(spec.key)
      if (existing) {
        existing.name = spec.name
        existing.character = spec.character
        if (existing.activity !== spec.activity && existing.route.length === 0)
          this.forceActivity(existing, spec.activity)
        continue
      }
      const position = this.stationPoint(spec.island, spec.slot)
      this.agents.set(spec.key, {
        key: spec.key,
        character: spec.character,
        name: spec.name,
        preview: spec.preview,
        position: { ...position },
        island: spec.island,
        slot: spec.slot,
        facing: 1,
        activity: spec.activity,
        activityStarted: this.time,
        activityUntil: null,
        activityNext: null,
        route: [],
        legIndex: 0,
        legDistance: 0,
        teleport: null,
        destination: null,
        onArrive: null,
        speech: null,
        animationStarted: this.time,
        lastAnimation: ACTIVITY_PRESENTATION[spec.activity].animation,
        orb: null,
        visible: true,
      })
    }
    this.emit({ type: 'agents' })
  }

  private forceActivity(agent: AgentRuntime, state: ActivityState, plan?: ActivityPlan) {
    const from = agent.activity
    agent.activity = state
    agent.activityStarted = this.time
    agent.activityUntil = plan?.seconds !== undefined ? this.time + plan.seconds : null
    agent.activityNext = plan?.next ?? (plan?.seconds !== undefined && state === 'completed' ? 'idle' : null)
    if (from !== state) this.emit({ type: 'activity', key: agent.key, from, to: state })
  }

  /** Ubah aktivitas bila transisinya sah. Mengembalikan false bila ditolak. */
  setActivity(key: string, plan: ActivityPlan): boolean {
    const agent = this.agents.get(key)
    if (!agent || !canTransition(agent.activity, plan.state)) return false
    if (plan.state !== 'moving' && agent.route.length > 0) this.cancel(key)
    this.forceActivity(agent, plan.state, plan)
    return true
  }

  say(key: string, text: string, seconds = 3) {
    const agent = this.agents.get(key)
    if (!agent) return
    agent.speech = { text, until: this.time + seconds }
    this.emit({ type: 'speech', key })
  }

  /**
   * Perintahkan agent menuju workstation. `then` dijalankan saat tiba.
   * Mengembalikan false bila rute tidak ditemukan atau transisi ditolak.
   */
  moveTo(key: string, target: { island: IslandId; slot?: number | null }, then?: ActivityPlan): boolean {
    const agent = this.agents.get(key)
    if (!agent || agent.activity === 'offline') return false
    if (!canTransition(agent.activity, 'moving') && agent.activity !== 'moving') return false
    const slot = target.slot === undefined ? this.freeSlot(target.island, key) : target.slot
    const destination = this.stationPoint(target.island, slot)
    // Sedang transit di jalur energi: selesaikan teleport dulu, lalu rute baru dari portal tujuan.
    const origin = agent.teleport
      ? { island: agent.teleport.leg.to, point: agent.teleport.to }
      : { island: agent.island, point: agent.position }
    const route = findRoute(this.world, origin, { island: target.island, point: destination })
    agent.destination = { island: target.island, slot }
    agent.onArrive = then ?? null
    if (route.length === 0 && !agent.teleport) {
      agent.slot = slot
      agent.island = target.island
      this.arrive(agent)
      return true
    }
    if (this.reducedMotion) {
      agent.route = []
      agent.teleport = null
      agent.position = { ...destination }
      agent.island = target.island
      agent.visible = true
      agent.orb = null
      this.arrive(agent)
      return true
    }
    if (agent.teleport) {
      agent.route = [agent.teleport.leg, ...route]
      agent.legIndex = 0
    } else {
      agent.route = route
      agent.legIndex = 0
      agent.legDistance = 0
    }
    agent.slot = null
    if (agent.activity !== 'moving') this.forceActivity(agent, 'moving')
    this.emit({ type: 'route', key, island: target.island, slot })
    return true
  }

  /** Hentikan rute (pembatalan). Teleport yang sedang transit tetap diselesaikan. */
  cancel(key: string) {
    const agent = this.agents.get(key)
    if (!agent || agent.route.length === 0) return
    if (agent.teleport) {
      agent.route = [agent.teleport.leg]
      agent.legIndex = 0
      agent.destination = { island: agent.teleport.leg.to, slot: null }
      agent.onArrive = null
      return
    }
    agent.route = []
    agent.destination = null
    agent.onArrive = null
    this.forceActivity(agent, 'idle')
  }

  private arrive(agent: AgentRuntime) {
    const target = agent.destination
    agent.route = []
    agent.legIndex = 0
    agent.legDistance = 0
    agent.teleport = null
    agent.orb = null
    agent.visible = true
    if (target) {
      agent.island = target.island
      agent.slot = target.slot
    }
    agent.destination = null
    const plan = agent.onArrive
    agent.onArrive = null
    this.forceActivity(agent, plan?.state ?? 'idle', plan ?? undefined)
    this.emit({ type: 'arrived', key: agent.key, island: agent.island, slot: agent.slot })
  }

  /** Majukan simulasi. `dt` = detik waktu nyata (dibatasi agar tab yang tertidur tidak melompat). */
  tick(dt: number) {
    if (this.paused) return
    const step = Math.min(dt, 0.1) * this.speed
    this.time += step
    for (const agent of this.agents.values()) {
      if (agent.speech && this.time >= agent.speech.until) {
        agent.speech = null
        this.emit({ type: 'speech', key: agent.key })
      }
      if (agent.route.length > 0) this.advance(agent, step)
      else if (agent.activityUntil !== null && this.time >= agent.activityUntil) {
        const next = agent.activityNext
        agent.activityUntil = null
        agent.activityNext = null
        // `completed` otomatis kembali siaga setelah perayaan singkat.
        if (next)
          this.forceActivity(agent, next, next === 'completed' ? { state: next, seconds: COMPLETED_HOLD } : undefined)
      }
    }
  }

  private advance(agent: AgentRuntime, step: number) {
    const leg = agent.route[agent.legIndex]
    if (!leg) {
      this.arrive(agent)
      return
    }
    if (leg.kind === 'walk') {
      const total = legLength(leg.points)
      const s = agent.legDistance
      const ratio = Math.max(MIN_SPEED_RATIO, Math.min(1, (s + 4) / ACCEL_DISTANCE, (total - s + 4) / ACCEL_DISTANCE))
      agent.legDistance = Math.min(total, s + this.walkSpeed * ratio * step)
      const { point, dx } = pointAlong(leg.points, agent.legDistance)
      agent.position = point
      if (Math.abs(dx) > 0.5) agent.facing = dx > 0 ? 1 : -1
      if (agent.legDistance >= total - 0.01) this.nextLeg(agent)
      return
    }
    // Teleport: masuk → transit (orb di jalur energi) → keluar.
    const islandFrom = this.world.islands.get(leg.from)
    const islandTo = this.world.islands.get(leg.to)
    if (!islandFrom || !islandTo) {
      this.nextLeg(agent)
      return
    }
    if (!agent.teleport) {
      agent.teleport = {
        leg,
        phase: 'in',
        started: this.time,
        from: islandFrom.portal.entry,
        to: islandTo.portal.exit,
      }
      agent.position = { ...islandFrom.portal.entry }
      this.emit({ type: 'teleport', key: agent.key, from: leg.from, to: leg.to, phase: 'in' })
    }
    const run = agent.teleport
    const elapsed = this.time - run.started
    if (run.phase === 'in' && elapsed >= TELEPORT_IN) {
      run.phase = 'transit'
      run.started = this.time
      agent.visible = false
    } else if (run.phase === 'transit') {
      const t = Math.min(1, elapsed / TELEPORT_TRANSIT)
      agent.orb = quadratic(run.from, leg.link.curve.control, run.to, t)
      if (t >= 1) {
        run.phase = 'out'
        run.started = this.time
        agent.orb = null
        agent.visible = true
        agent.position = { ...run.to }
        agent.island = leg.to
        this.emit({ type: 'teleport', key: agent.key, from: leg.from, to: leg.to, phase: 'out' })
      }
    } else if (run.phase === 'out' && elapsed >= TELEPORT_IN) {
      agent.teleport = null
      this.nextLeg(agent)
    }
  }

  private nextLeg(agent: AgentRuntime) {
    agent.legIndex += 1
    agent.legDistance = 0
    if (agent.legIndex >= agent.route.length) this.arrive(agent)
  }

  /** Animasi & frame saat ini per agent (dibaca renderer setiap frame). */
  renderStates(): AgentRenderState[] {
    const states: AgentRenderState[] = []
    for (const agent of this.agents.values()) {
      let animation: AgentAnimationName = ACTIVITY_PRESENTATION[agent.activity].animation
      let reverse = false
      const leg = agent.route[agent.legIndex]
      if (agent.teleport) {
        animation = 'teleport'
        reverse = agent.teleport.phase === 'out'
      } else if (leg?.kind === 'walk') animation = 'walk'
      if (animation !== agent.lastAnimation) {
        agent.lastAnimation = animation
        agent.animationStarted = agent.teleport ? agent.teleport.started : this.time
      }
      const definition = AGENT_ANIMATIONS[animation]
      const elapsed = this.time - agent.animationStarted
      let frame = Math.floor(elapsed * definition.fps)
      if (this.reducedMotion && definition.loop) frame = 0
      else if (definition.loop) frame %= definition.frames
      else frame = Math.min(definition.frames - 1, frame)
      if (reverse) frame = definition.frames - 1 - frame
      states.push({
        key: agent.key,
        x: agent.position.x,
        y: agent.position.y,
        facing: animation === 'walk' ? agent.facing : 1,
        animation,
        frame,
        visible: agent.visible,
        depth: 100 + Math.round(agent.position.y),
        orb: agent.orb,
      })
    }
    return states
  }
}
