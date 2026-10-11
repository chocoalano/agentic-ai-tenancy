import { framePosition } from './animation-spec'
import type { AgentRenderState } from './engine'

/*
 * Renderer DOM Virtual Office: menulis gaya elemen robot & orb secara langsung
 * (CSS custom property `--ax/--ay`, posisi frame sheet, arah hadap, visibilitas,
 * kedalaman, serta atribut data arah/ambient/ack untuk CSS & pengujian).
 * Dipanggil dari loop requestAnimationFrame tunggal; hanya properti yang
 * berubah yang ditulis. Tanpa Vue agar bisa diuji dan tidak memicu
 * reaktivitas per frame.
 */

interface RenderTarget {
  root: HTMLElement
  sprite: HTMLElement
  last: {
    x: number
    y: number
    frame: string
    facing: number
    heading: string
    visible: boolean
    depth: number
    ambient: string | null
    acknowledging: boolean
  }
}

export interface OfficeDomRenderer {
  register(key: string, root: HTMLElement, sprite: HTMLElement): void
  unregister(key: string): void
  registerOrb(key: string, element: HTMLElement): void
  unregisterOrb(key: string): void
  render(states: AgentRenderState[]): void
}

export function createDomRenderer(): OfficeDomRenderer {
  const targets = new Map<string, RenderTarget>()
  const orbs = new Map<string, HTMLElement>()

  return {
    register(key, root, sprite) {
      targets.set(key, {
        root,
        sprite,
        last: {
          x: Number.NaN,
          y: Number.NaN,
          frame: '',
          facing: 1,
          heading: '',
          visible: true,
          depth: -1,
          ambient: null,
          acknowledging: false,
        },
      })
    },
    unregister(key) {
      targets.delete(key)
    },
    registerOrb(key, element) {
      orbs.set(key, element)
    },
    unregisterOrb(key) {
      orbs.delete(key)
    },
    render(states) {
      for (const state of states) {
        const target = targets.get(state.key)
        if (target) {
          const { root, sprite, last } = target
          // Perbandingan eksak: `last` diinisialisasi NaN sehingga frame pertama selalu ditulis.
          if (state.x !== last.x || state.y !== last.y) {
            root.style.setProperty('--ax', state.x.toFixed(2))
            root.style.setProperty('--ay', state.y.toFixed(2))
            last.x = state.x
            last.y = state.y
          }
          const frameKey = `${state.animation}:${state.frame}`
          if (frameKey !== last.frame) {
            const position = framePosition(state.animation, state.frame)
            sprite.style.backgroundPosition = `${position.x} ${position.y}`
            sprite.dataset.animation = state.animation
            last.frame = frameKey
          }
          if (state.facing !== last.facing) {
            sprite.style.transform = state.facing < 0 ? 'scaleX(-1)' : ''
            last.facing = state.facing
          }
          if (state.heading !== last.heading) {
            sprite.dataset.heading = state.heading
            last.heading = state.heading
          }
          if (state.visible !== last.visible) {
            root.style.visibility = state.visible ? '' : 'hidden'
            last.visible = state.visible
          }
          if (state.depth !== last.depth) {
            root.style.zIndex = String(state.depth)
            last.depth = state.depth
          }
          if (state.ambient !== last.ambient) {
            if (state.ambient) root.dataset.ambient = state.ambient
            else delete root.dataset.ambient
            last.ambient = state.ambient
          }
          if (state.acknowledging !== last.acknowledging) {
            if (state.acknowledging) root.dataset.acknowledging = 'true'
            else delete root.dataset.acknowledging
            last.acknowledging = state.acknowledging
          }
        }
        const orb = orbs.get(state.key)
        if (orb) {
          if (state.orb) {
            orb.style.setProperty('--ox', state.orb.x.toFixed(2))
            orb.style.setProperty('--oy', state.orb.y.toFixed(2))
            orb.style.display = 'block'
          } else if (orb.style.display !== 'none') orb.style.display = 'none'
        }
      }
    },
  }
}
