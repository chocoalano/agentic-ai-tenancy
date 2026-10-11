import { stableHash } from '../utils/office-layout'
import type { AgentAnimationName } from './animation-spec'
import type { AgentRuntime, OfficeEngine } from './engine'
import type { IslandId } from './world'

/*
 * Kehidupan ambient kantor (murni, deterministik).
 *
 * Saat tidak ada perintah, robot pratinjau yang SIAGA sesekali menoleh,
 * merenung, memeriksa tablet, atau mengangguk, dan satu pulau sesekali
 * "menyala" sebentar (hologram aktif lalu memudar). Semua dijadwalkan dari jam
 * mesin (ikut jeda/kecepatan simulasi) dengan PRNG berbasis hash yang stabil,
 * sehingga urutannya dapat diuji ulang.
 *
 * Prioritas perilaku: perintah pengguna > aktivitas misi > aktivitas
 * workstation > ambient. Ambient hanya overlay animasi di mesin
 * (`AgentRuntime.ambient`) saat `engine.ambientApplies(agent)`; perintah atau
 * aktivitas apa pun langsung mengalahkannya (mesin membersihkan overlay pada
 * setiap perubahan aktivitas). Ambient tidak pernah memindahkan robot, tidak
 * menyentuh state machine, tidak membuat log/aktivitas, dan tidak menulis apa
 * pun ke backend. Reduced motion → tidak ada perilaku ambient.
 */

export type AmbientBehaviourId = 'glance' | 'ponder' | 'inspect' | 'nod'

export interface AmbientBehaviour {
  id: AmbientBehaviourId
  label: string
  animation: AgentAnimationName
  seconds: number
  /** Menoleh: arah hadap dibalik selama overlay. */
  flip?: boolean
}

export const AMBIENT_BEHAVIOURS: readonly AmbientBehaviour[] = [
  { id: 'glance', label: 'Menoleh', animation: 'idle', seconds: 1.4, flip: true },
  { id: 'ponder', label: 'Merenung sejenak', animation: 'think', seconds: 1.8 },
  { id: 'inspect', label: 'Memeriksa tablet', animation: 'read', seconds: 1.6 },
  { id: 'nod', label: 'Mengangguk', animation: 'communicate', seconds: 0.9 },
]

export interface AmbientOptions {
  /** Benih jadwal (default 'office'); benih sama → urutan sama. */
  seed?: string
  /** Jeda antar perilaku per robot (detik simulasi). */
  minGap?: number
  maxGap?: number
  /** Maksimum robot yang beraksi bersamaan (tidak pernah serempak). */
  maxConcurrent?: number
  /** Lama hologram pulau menyala (detik) dan jeda antar nyala. */
  islandGlowSeconds?: number
  islandMinGap?: number
  islandMaxGap?: number
  /** Jeda sebelum perilaku pertama setelah siaga (agar tidak langsung "gelisah" usai bekerja). */
  settleSeconds?: number
}

export interface AmbientSnapshot {
  /** Overlay yang sedang diputar per agent (id perilaku). */
  agents: Record<string, AmbientBehaviourId>
  /** Pulau yang hologramnya sedang menyala secara ambient. */
  islands: IslandId[]
}

interface AgentPlan {
  nextAt: number
  counter: number
}

interface IslandGlow {
  id: IslandId | null
  until: number
  nextAt: number
  counter: number
}

export class AmbientScheduler {
  enabled = true
  private readonly seed: string
  private readonly minGap: number
  private readonly maxGap: number
  private readonly maxConcurrent: number
  private readonly islandGlowSeconds: number
  private readonly islandMinGap: number
  private readonly islandMaxGap: number
  private readonly settleSeconds: number
  private readonly plans = new Map<string, AgentPlan>()
  private readonly glow: IslandGlow
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly engine: OfficeEngine,
    options: AmbientOptions = {},
  ) {
    this.seed = options.seed ?? 'office'
    this.minGap = options.minGap ?? 6
    this.maxGap = options.maxGap ?? 14
    this.maxConcurrent = options.maxConcurrent ?? 2
    this.islandGlowSeconds = options.islandGlowSeconds ?? 2.6
    this.islandMinGap = options.islandMinGap ?? 7
    this.islandMaxGap = options.islandMaxGap ?? 13
    this.settleSeconds = options.settleSeconds ?? 3
    this.glow = { id: null, until: 0, nextAt: engine.time + this.islandMinGap, counter: 0 }
  }

  /** Dipanggil saat ada perubahan yang perlu dilihat UI (nyala/padam hologram pulau). */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  /** Bilangan acak deterministik [0, 1) dari benih, kunci, dan hitungan. */
  private random(key: string, counter: number, salt: string): number {
    return (stableHash(`${this.seed}|${key}|${counter}|${salt}`) % 10_000) / 10_000
  }

  private gap(key: string, counter: number): number {
    return this.minGap + (this.maxGap - this.minGap) * this.random(key, counter, 'gap')
  }

  private pick(key: string, counter: number): AmbientBehaviour {
    const index = Math.floor(this.random(key, counter, 'behaviour') * AMBIENT_BEHAVIOURS.length)
    return AMBIENT_BEHAVIOURS[Math.min(index, AMBIENT_BEHAVIOURS.length - 1)] ?? AMBIENT_BEHAVIOURS[0]!
  }

  private plan(agent: AgentRuntime): AgentPlan {
    const existing = this.plans.get(agent.key)
    if (existing) return existing
    const created: AgentPlan = {
      nextAt: this.engine.time + this.settleSeconds + this.gap(agent.key, 0),
      counter: 0,
    }
    this.plans.set(agent.key, created)
    return created
  }

  snapshot(): AmbientSnapshot {
    const agents: Record<string, AmbientBehaviourId> = {}
    for (const agent of this.engine.agents.values()) {
      const overlay = agent.ambient
      if (overlay && this.engine.ambientApplies(agent)) {
        const behaviour = AMBIENT_BEHAVIOURS.find((item) => item.id === overlay.id)
        if (behaviour) agents[agent.key] = behaviour.id
      }
    }
    return { agents, islands: this.glow.id ? [this.glow.id] : [] }
  }

  /** Dipanggil setiap tick setelah `engine.tick()` dan simulasi. Hanya jam mesin yang dipakai (ikut jeda). */
  update() {
    if (!this.enabled || this.engine.reducedMotion) {
      this.clear()
      return
    }
    const now = this.engine.time
    let active = 0
    for (const agent of this.engine.agents.values()) if (agent.ambient && this.engine.ambientApplies(agent)) active += 1
    for (const agent of this.engine.agents.values()) {
      if (!agent.preview) continue
      const plan = this.plan(agent)
      if (!this.engine.ambientApplies(agent)) {
        if (agent.ambient) this.engine.setAmbient(agent.key, null)
        // Baru selesai bekerja/bergerak: tenang dulu sebelum perilaku ambient berikutnya.
        plan.nextAt = Math.max(plan.nextAt, now + this.settleSeconds)
        continue
      }
      if (agent.ambient) continue
      if (now < plan.nextAt || active >= this.maxConcurrent) continue
      const behaviour = this.pick(agent.key, plan.counter)
      const accepted = this.engine.setAmbient(agent.key, {
        id: behaviour.id,
        animation: behaviour.animation,
        until: now + behaviour.seconds,
        facing: behaviour.flip ? (agent.facing === 1 ? -1 : 1) : undefined,
      })
      plan.counter += 1
      plan.nextAt = now + behaviour.seconds + this.gap(agent.key, plan.counter)
      if (accepted) active += 1
    }
    this.updateIslandGlow(now)
  }

  private updateIslandGlow(now: number) {
    let changed = false
    if (this.glow.id && now >= this.glow.until) {
      this.glow.id = null
      changed = true
    }
    if (!this.glow.id && now >= this.glow.nextAt) {
      const candidates = this.idleIslands()
      if (candidates.length > 0) {
        const index = Math.floor(this.random('island', this.glow.counter, 'pick') * candidates.length)
        this.glow.id = candidates[Math.min(index, candidates.length - 1)] ?? null
        this.glow.until = now + this.islandGlowSeconds
        changed = this.glow.id !== null
      }
      this.glow.counter += 1
      this.glow.nextAt =
        now +
        this.islandGlowSeconds +
        this.islandMinGap +
        (this.islandMaxGap - this.islandMinGap) * this.random('island', this.glow.counter, 'gap')
    }
    if (changed) this.notify()
  }

  /** Pulau yang dapat dijalani dan sedang tidak dipakai bekerja/dituju (yang sedang dipakai sudah menyala sendiri). */
  private idleIslands(): IslandId[] {
    const busy = new Set<IslandId>()
    for (const agent of this.engine.agents.values()) {
      if (agent.destination) busy.add(agent.destination.island)
      if (agent.activity !== 'idle' && agent.activity !== 'offline') busy.add(agent.island)
    }
    return [...this.engine.world.islands.keys()].filter((island) => !busy.has(island))
  }

  /** Lepas semua overlay & nyala pulau (mis. mode berubah, reduced motion, unmount). */
  clear() {
    let changed = false
    for (const agent of this.engine.agents.values()) {
      if (agent.ambient) {
        this.engine.setAmbient(agent.key, null)
        changed = true
      }
    }
    if (this.glow.id) {
      this.glow.id = null
      changed = true
    }
    if (changed) this.notify()
  }

  /** Buang jadwal (agent/mode baru memulai dari awal) dan lepas overlay. */
  reset() {
    this.plans.clear()
    this.glow.until = 0
    this.glow.nextAt = this.engine.time + this.islandMinGap
    this.glow.counter = 0
    this.clear()
  }

  dispose() {
    this.clear()
    this.plans.clear()
    this.listeners.clear()
  }
}
