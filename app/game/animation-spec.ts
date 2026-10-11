import type { CharacterKey } from '../utils/game-assets'

/*
 * Kontrak animasi karakter (satu sumber kebenaran untuk skrip pembuat sprite
 * sheet dan runtime game).
 *
 * Setiap karakter memiliki sheet `public/game-assets-v2/agents/{karakter}/sheet.webp`
 * + `atlas.json` dengan grid seragam: satu baris per animasi, frame 192 × 224,
 * pivot kaki (96, 214). Semua karakter memenuhi kontrak minimum yang sama.
 *
 * KUALITAS SAAT INI: `procedural-prototype` — frame diturunkan secara
 * prosedural dari satu sprite statis per karakter (napas, langkah kaki yang
 * diiris, condong, lompat, larut-teleport, guncang). Ini fallback prototipe
 * yang terdokumentasi; frame gambar tangan artist tetap dibutuhkan
 * (docs/character-animation-system.md). Pose `character-states` tidak dipakai
 * karena garis tepinya terpotong (lihat docs/game-asset-quality-report.md).
 */

export const AGENT_FRAME = { width: 192, height: 224 } as const
/** Pivot kaki dalam frame (px). */
export const AGENT_ANCHOR = { x: 96, y: 214 } as const
/** Tinggi tubuh robot dalam frame (px) — skala sprite sumber. */
export const AGENT_BODY_HEIGHT = 176

export type AnimationDirection = 'front' | 'right'

export type AgentAnimationName =
  'idle' | 'walk' | 'think' | 'work' | 'read' | 'communicate' | 'celebrate' | 'teleport' | 'error'

export interface AnimationDefinition {
  frames: number
  fps: number
  loop: boolean
  direction: AnimationDirection
  /** Animasi berikutnya setelah selesai (non-loop). */
  next?: AgentAnimationName
  /** Sheet menghadap kanan; kiri = cermin horizontal oleh renderer. */
  mirrorForLeft?: boolean
  /** Diputar mundur untuk fase keluar (teleport). */
  reverseForExit?: boolean
}

export const AGENT_ANIMATIONS: Record<AgentAnimationName, AnimationDefinition> = {
  idle: { frames: 8, fps: 6, loop: true, direction: 'front' },
  walk: { frames: 8, fps: 12, loop: true, direction: 'right', mirrorForLeft: true },
  think: { frames: 8, fps: 5, loop: true, direction: 'front' },
  work: { frames: 8, fps: 10, loop: true, direction: 'front' },
  read: { frames: 8, fps: 6, loop: true, direction: 'front' },
  communicate: { frames: 8, fps: 8, loop: true, direction: 'front' },
  celebrate: { frames: 8, fps: 12, loop: false, direction: 'front', next: 'idle' },
  teleport: { frames: 8, fps: 16, loop: false, direction: 'front', reverseForExit: true },
  error: { frames: 6, fps: 12, loop: false, direction: 'front', next: 'idle' },
}

/** Urutan baris pada sheet. */
export const ANIMATION_ROWS: readonly AgentAnimationName[] = [
  'idle',
  'walk',
  'think',
  'work',
  'read',
  'communicate',
  'celebrate',
  'teleport',
  'error',
]

export const AGENT_SHEET = {
  columns: Math.max(...ANIMATION_ROWS.map((name) => AGENT_ANIMATIONS[name].frames)),
  rows: ANIMATION_ROWS.length,
}

export const AGENT_SHEET_QUALITY = 'procedural-prototype' as const

export function agentSheetSource(character: CharacterKey): { src: string; atlas: string } {
  return {
    src: `/game-assets-v2/agents/${character}/sheet.webp`,
    atlas: `/game-assets-v2/agents/${character}/atlas.json`,
  }
}

/** Posisi frame di sheet (persen untuk background-position). */
export function framePosition(animation: AgentAnimationName, frame: number): { x: string; y: string } {
  const row = ANIMATION_ROWS.indexOf(animation)
  const columns = AGENT_SHEET.columns
  const rows = AGENT_SHEET.rows
  return {
    x: `${(frame / (columns - 1)) * 100}%`,
    y: `${(row / (rows - 1)) * 100}%`,
  }
}

/* ------------------------------------------------------------------ *
 * Resep frame prosedural (hanya dipakai skrip pembuat sheet)
 * ------------------------------------------------------------------ */

export interface FrameRecipe {
  /** Geser tubuh (px frame). */
  dx: number
  dy: number
  /** Derajat, searah jarum jam, berporos di kaki. */
  rotate: number
  scaleX: number
  scaleY: number
  alpha: number
  tint?: { r: number; g: number; b: number; amount: number }
  /** Angkat/ayun kaki kiri & kanan (px) — langkah berjalan. */
  legs?: { leftLift: number; rightLift: number; leftShift: number; rightShift: number }
}

const BASE: FrameRecipe = { dx: 0, dy: 0, rotate: 0, scaleX: 1, scaleY: 1, alpha: 1 }

export function frameRecipe(animation: AgentAnimationName, frame: number): FrameRecipe {
  const count = AGENT_ANIMATIONS[animation].frames
  const phase = (frame / count) * Math.PI * 2
  const wave = Math.sin(phase)
  switch (animation) {
    case 'idle':
      return { ...BASE, dy: -1.5 * (wave + 1), scaleY: 1 + 0.018 * wave, scaleX: 1 - 0.008 * wave }
    case 'walk': {
      const step = Math.sin(phase)
      return {
        ...BASE,
        dy: -Math.abs(step) * 5,
        rotate: 4,
        scaleY: 1 - 0.015 * Math.abs(Math.cos(phase)),
        legs: {
          leftLift: Math.max(0, step) * 8,
          rightLift: Math.max(0, -step) * 8,
          leftShift: step * 1.5,
          rightShift: -step * 1.5,
        },
      }
    }
    case 'think':
      return { ...BASE, rotate: 5 * wave, dy: -1.5 * (wave + 1) }
    case 'work':
      return {
        ...BASE,
        dy: -2.5 * Math.abs(Math.sin(phase * 2)),
        rotate: 3,
        scaleY: 1 - 0.02 * Math.abs(Math.sin(phase * 2)),
      }
    case 'read':
      return { ...BASE, rotate: 7 + 1.5 * wave, dy: -1 * (wave + 1) }
    case 'communicate':
      return { ...BASE, dy: -4 * Math.abs(Math.sin(phase * 2)), rotate: 4 * Math.sin(phase * 2) }
    case 'celebrate': {
      const arc = [0, 5, -12, -26, -32, -26, -12, 0][frame] ?? 0
      const squash = frame === 1 || frame === 7 ? 1 : 0
      return { ...BASE, dy: arc, rotate: 6 * Math.sin(phase * 2), scaleY: 1 - 0.08 * squash, scaleX: 1 + 0.06 * squash }
    }
    case 'teleport': {
      const t = frame / (count - 1)
      return {
        ...BASE,
        dy: -t * 12,
        scaleY: 1 - 0.85 * t ** 1.5,
        scaleX: 1 - 0.45 * t,
        alpha: 1 - 0.85 * t * t,
        tint: { r: 90, g: 230, b: 255, amount: 0.25 + 0.6 * t },
      }
    }
    case 'error':
      return {
        ...BASE,
        dx: [0, -6, 6, -4, 4, 0][frame] ?? 0,
        rotate: [0, -3, 3, -2, 2, 0][frame] ?? 0,
        tint: { r: 255, g: 70, b: 80, amount: [0.3, 0.5, 0.35, 0.5, 0.35, 0.15][frame] ?? 0.2 },
      }
  }
}
