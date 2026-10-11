import type { CharacterKey } from '../utils/game-assets'

/**
 * Peran & angka contoh kelima karakter pratinjau (lembar konsep "Project
 * Atlas"). Hanya untuk mode pratinjau berlabel — bukan data agent nyata.
 */
export const PREVIEW_CAST_BY_CHARACTER: Record<CharacterKey, { roleTitle: string; level: number; xp: number }> = {
  nova: { roleTitle: 'Koordinator', level: 12, xp: 82 },
  sage: { roleTitle: 'Peneliti', level: 11, xp: 76 },
  pixel: { roleTitle: 'Analis', level: 11, xp: 68 },
  bolt: { roleTitle: 'Pembangun', level: 10, xp: 90 },
  echo: { roleTitle: 'Operator', level: 10, xp: 74 },
}
