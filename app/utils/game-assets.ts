/*
 * Registry aset game Virtual Office ("Neon Mission Map — Project Atlas").
 *
 * Satu-satunya tempat path `/game-assets/...` didefinisikan. Komponen memakai
 * kunci bertipe (CHARACTERS.nova, ISLANDS['mission-hub'], ...) dan tidak
 * menulis path sendiri. Dimensi berasal dari `public/game-assets/asset-manifest.json`;
 * `bun run check:assets` memverifikasi registry ini terhadap manifest dan file.
 *
 * Modul ini murni (tanpa auto-import Nuxt) agar dapat dipakai skrip verifikasi
 * dan test Bun.
 *
 * Catatan kualitas aset (lihat docs/asset-integration-report.md):
 * - Sprite dipotong otomatis dari lembar konsep. `crop` (px natural) membuang
 *   sisa label teks dan serpihan objek tetangga di tepi potongan; file asli
 *   tidak diubah.
 * - Aset `fx` tidak memiliki alpha lembut (latar gelap ikut opak), sehingga
 *   dirender dengan mask luminans (`render: 'luminance'`) agar latar gelapnya
 *   transparan tanpa mengubah file.
 * - Resolusi kecil (pulau ±140 px, robot ±84 px). Aset yang dipakai di dunia
 *   memiliki varian v2 (`v2` = faktor skala) di /game-assets-v2 — dibuat oleh
 *   `bun run assets:v2` dari file asli: kliping, resampling Lanczos, pembuangan
 *   serpihan, pembersihan halo tepi, alpha anti-alias, dan (fx) konversi latar
 *   gelap menjadi alpha sungguhan. Varian ini TIDAK menambah detail ilustrasi;
 *   render ulang oleh artist tetap dibutuhkan (docs/game-asset-quality-report.md).
 */

export interface GameAssetCrop {
  top: number
  right: number
  bottom: number
  left: number
}

export interface GameAsset {
  /** ID manifest, mis. `islands/mission-hub`. */
  id: string
  /** URL publik, diturunkan dari ID. */
  src: string
  /** Dimensi natural file (px). */
  width: number
  height: number
  /** Inset kliping dalam px natural. */
  crop?: GameAssetCrop
  /** `luminance`: latar gelap opak dibuat transparan lewat mask luminans. */
  render?: 'image' | 'luminance'
  /** Pusat visual horizontal (0–1) dari area terlihat; sprite karakter tidak simetris. */
  anchorX?: number
  /** Faktor skala varian v2 (dikliping & diperbaiki), bila tersedia. */
  v2?: number
  /** Artwork rekonstruksi terversi; file pack asli dan varian prosedural tetap tersedia. */
  variant?: GameAssetSource
}

export interface GameAssetSource {
  src: string
  width: number
  height: number
}

const ASSET_ROOT = '/game-assets'

const ASSET_ROOT_V2 = '/game-assets-v2'

/** Faktor varian v2 per kategori (ikon & referensi UI memakai file asli). */
const V2_SCALE: Record<string, number> = {
  characters: 3,
  'character-states': 3,
  islands: 3,
  tiles: 3,
  fx: 2,
  backgrounds: 4,
}

function asset(id: string, width: number, height: number, extra: Partial<GameAsset> = {}): GameAsset {
  const v2 = V2_SCALE[id.split('/')[0] ?? '']
  return { id, src: `${ASSET_ROOT}/${id}.png`, width, height, ...(v2 ? { v2 } : {}), ...extra }
}

function crop(top: number, right: number, bottom: number, left: number): GameAssetCrop {
  return { top, right, bottom, left }
}

/** Ukuran area terlihat setelah kliping. */
export function visibleSize(item: GameAsset, useVariant = true): { width: number; height: number } {
  if (useVariant && item.variant) return { width: item.variant.width, height: item.variant.height }
  const inset = item.crop ?? crop(0, 0, 0, 0)
  return {
    width: item.width - inset.left - inset.right,
    height: item.height - inset.top - inset.bottom,
  }
}

/** Sumber varian v2 (area terlihat × faktor `v2`, WebP alpha), atau undefined. */
export function v2Source(item: GameAsset, useVariant = true): GameAssetSource | undefined {
  if (useVariant && item.variant) return item.variant
  if (!item.v2) return undefined
  const size = visibleSize(item, false)
  return {
    src: `${ASSET_ROOT_V2}/${item.id}.webp`,
    width: size.width * item.v2,
    height: size.height * item.v2,
  }
}

/** Geser horizontal (CSS translateX) agar pusat visual sprite tepat di tengah kotaknya. */
export function centeringShift(item: GameAsset): string {
  return `${((0.5 - (item.anchorX ?? 0.5)) * 100).toFixed(1)}%`
}

/* ------------------------------------------------------------------ *
 * Karakter
 * ------------------------------------------------------------------ */

export const CHARACTER_KEYS = ['nova', 'sage', 'pixel', 'bolt', 'echo'] as const
export type CharacterKey = (typeof CHARACTER_KEYS)[number]

export interface CharacterAsset extends GameAsset {
  /** Nama karakter dalam asset pack — BUKAN nama AI employee. */
  name: string
  /** Arketipe peran dari lembar konsep (dipakai untuk pemetaan presentasi). */
  archetype: string
}

export const CHARACTERS: Record<CharacterKey, CharacterAsset> = {
  nova: { ...asset('characters/nova', 84, 106, { anchorX: 0.64 }), name: 'Nova', archetype: 'Koordinator' },
  sage: { ...asset('characters/sage', 82, 106, { anchorX: 0.63 }), name: 'Sage', archetype: 'Peneliti' },
  pixel: { ...asset('characters/pixel', 77, 106, { anchorX: 0.61 }), name: 'Pixel', archetype: 'Analis' },
  bolt: { ...asset('characters/bolt', 86, 106, { anchorX: 0.65 }), name: 'Bolt', archetype: 'Pembangun' },
  echo: { ...asset('characters/echo', 82, 106, { anchorX: 0.62 }), name: 'Echo', archetype: 'Operator' },
}

export const CHARACTER_STATE_KEYS = [
  'idle',
  'thinking',
  'working',
  'analyzing',
  'generating',
  'researching',
  'coding',
  'reporting',
  'communicating',
  'success',
  'alert',
] as const
export type CharacterStateKey = (typeof CHARACTER_STATE_KEYS)[number]

export const CHARACTER_STATES: Record<CharacterStateKey, GameAsset & { label: string }> = {
  idle: { ...asset('character-states/idle', 82, 100), label: 'Siaga' },
  thinking: { ...asset('character-states/thinking', 86, 100), label: 'Berpikir' },
  working: { ...asset('character-states/working', 97, 102), label: 'Bekerja' },
  analyzing: { ...asset('character-states/analyzing', 89, 103, { crop: crop(0, 0, 0, 4) }), label: 'Menganalisis' },
  generating: { ...asset('character-states/generating', 100, 103, { crop: crop(0, 0, 0, 11) }), label: 'Menghasilkan' },
  researching: { ...asset('character-states/researching', 83, 89, { crop: crop(5, 0, 0, 3) }), label: 'Meriset' },
  coding: { ...asset('character-states/coding', 84, 92, { crop: crop(10, 4, 0, 0) }), label: 'Membangun' },
  reporting: { ...asset('character-states/reporting', 82, 90, { crop: crop(10, 8, 0, 0) }), label: 'Melapor' },
  communicating: {
    ...asset('character-states/communicating', 95, 89, { crop: crop(9, 15, 0, 0) }),
    label: 'Berkomunikasi',
  },
  success: { ...asset('character-states/success', 81, 89, { crop: crop(6, 18, 0, 0) }), label: 'Berhasil' },
  alert: { ...asset('character-states/alert', 60, 85, { crop: crop(6, 0, 0, 0) }), label: 'Peringatan' },
}

/* ------------------------------------------------------------------ *
 * Pulau / workstation
 * ------------------------------------------------------------------ */

export const ISLAND_KEYS = [
  'mission-hub',
  'web-research',
  'data-warehouse',
  'client-brief',
  'knowledge-base',
  'analytics-tool',
  'report-builder',
  'research-lab',
  'training-center',
  'task-manager',
] as const
export type IslandKey = (typeof ISLAND_KEYS)[number]

export const ISLANDS: Record<IslandKey, GameAsset> = {
  'mission-hub': asset('islands/mission-hub', 250, 239, { crop: crop(0, 18, 0, 0) }),
  'web-research': asset('islands/web-research', 130, 127),
  'data-warehouse': asset('islands/data-warehouse', 147, 132, { crop: crop(0, 5, 0, 0) }),
  'client-brief': asset('islands/client-brief', 145, 127, { crop: crop(0, 3, 0, 3) }),
  'knowledge-base': asset('islands/knowledge-base', 132, 112, { crop: crop(0, 6, 0, 7) }),
  'analytics-tool': asset('islands/analytics-tool', 145, 126, { crop: crop(0, 9, 0, 0) }),
  'report-builder': asset('islands/report-builder', 123, 114, { crop: crop(0, 11, 0, 0) }),
  'research-lab': asset('islands/research-lab', 114, 112, { crop: crop(0, 3, 0, 0) }),
  'training-center': asset('islands/training-center', 106, 111),
  'task-manager': asset('islands/task-manager', 119, 111, { crop: crop(0, 7, 0, 0) }),
}

/** Ilustrasi statis direkonstruksi dari referensi; bukan frame animasi karakter. */
const RECONSTRUCTED_ISLANDS: readonly IslandKey[] = [
  'mission-hub',
  'web-research',
  'data-warehouse',
  'client-brief',
  'knowledge-base',
  'analytics-tool',
  'report-builder',
  'task-manager',
]
for (const key of RECONSTRUCTED_ISLANDS) {
  ISLANDS[key].variant = { src: `${ASSET_ROOT_V2}/islands/${key}-v3.webp`, width: 1536, height: 1024 }
}

export const MISSION_CITY_BACKGROUND: GameAssetSource = {
  src: `${ASSET_ROOT_V2}/backgrounds/mission-city-v3.webp`,
  width: 1672,
  height: 941,
}

/* ------------------------------------------------------------------ *
 * Lingkungan
 * ------------------------------------------------------------------ */

export const TILE_KEYS = [
  'cloud',
  'grass',
  'purple-grass',
  'purple-forest',
  'evergreen-trees',
  'crystal-rock',
  'rocks',
  'shrubs',
  'stone-cluster',
] as const
export type TileKey = (typeof TILE_KEYS)[number]

/**
 * Catatan: pemotong otomatis memberi beberapa nama yang tidak sesuai isi —
 * `crystal-rock.png` berisi potongan blok rumput, sedangkan kristal biru ada
 * di `stone-cluster.png`. Nama file dipertahankan sesuai manifest.
 */
export const TILES: Record<TileKey, GameAsset> = {
  cloud: asset('tiles/cloud', 120, 69, { crop: crop(18, 0, 2, 33) }),
  grass: asset('tiles/grass', 59, 56, { crop: crop(7, 0, 0, 19) }),
  'purple-grass': asset('tiles/purple-grass', 65, 58, { crop: crop(10, 11, 0, 0) }),
  'purple-forest': asset('tiles/purple-forest', 73, 57, { crop: crop(10, 3, 0, 0) }),
  'evergreen-trees': asset('tiles/evergreen-trees', 62, 52, { crop: crop(17, 7, 0, 25) }),
  'crystal-rock': asset('tiles/crystal-rock', 60, 57, { crop: crop(8, 26, 0, 0) }),
  rocks: asset('tiles/rocks', 68, 52, { crop: crop(22, 0, 0, 30) }),
  shrubs: asset('tiles/shrubs', 69, 54, { crop: crop(21, 10, 0, 8) }),
  'stone-cluster': asset('tiles/stone-cluster', 70, 54, { crop: crop(25, 9, 0, 3) }),
}

export const FX_KEYS = [
  'portal-cyan',
  'portal-violet',
  'energy-ring',
  'energy-spawn',
  'hologram-cube',
  'particles-cyan',
  'particles-purple',
  'connection-path',
] as const
export type FxKey = (typeof FX_KEYS)[number]

export const FX: Record<FxKey, GameAsset> = {
  'portal-cyan': asset('fx/portal-cyan', 86, 47, { render: 'luminance' }),
  'portal-violet': asset('fx/portal-violet', 91, 44, { render: 'luminance' }),
  'energy-ring': asset('fx/energy-ring', 62, 65, { render: 'luminance' }),
  'energy-spawn': asset('fx/energy-spawn', 72, 68, { render: 'luminance' }),
  'hologram-cube': asset('fx/hologram-cube', 68, 66, { render: 'luminance' }),
  'particles-cyan': asset('fx/particles-cyan', 57, 55, { render: 'luminance' }),
  'particles-purple': asset('fx/particles-purple', 58, 55, { render: 'luminance' }),
  'connection-path': asset('fx/connection-path', 240, 68, { render: 'luminance' }),
}

/** city-skyline.png memuat judul lembar sumber ("10. BACKGROUND & ENVIRONMENT") di atas lukisan — dikliping. */
export const BACKGROUNDS = {
  'city-skyline': asset('backgrounds/city-skyline', 317, 125, { crop: crop(20, 30, 0, 22) }),
} as const satisfies Record<string, GameAsset>

/* ------------------------------------------------------------------ *
 * Ikon (ubin opak; `crop` = ubin utuh tanpa serpihan & sisa label)
 * ------------------------------------------------------------------ */

export const ICON_KEYS = [
  'globe',
  'database',
  'analytics',
  'document',
  'task',
  'knowledge',
  'research',
  'settings',
  'user',
  'chat',
  'check',
  'clock',
  'warning',
  'error',
  'growth',
  'star',
  'trophy',
  'lightning',
  'cpu',
  'network',
] as const
export type IconKey = (typeof ICON_KEYS)[number]

/** Ubin ikon yang terpotong utuh oleh pemotong otomatis (aman dipakai di HUD). */
export const ICONS: Record<IconKey, GameAsset> = {
  globe: asset('icons/globe', 54, 63),
  database: asset('icons/database', 56, 63),
  analytics: asset('icons/analytics', 65, 63),
  document: asset('icons/document', 62, 63, { crop: crop(5, 0, 11, 16) }),
  task: asset('icons/task', 65, 63, { crop: crop(5, 4, 11, 15) }),
  knowledge: asset('icons/knowledge', 56, 62),
  research: asset('icons/research', 57, 62),
  settings: asset('icons/settings', 60, 62),
  user: asset('icons/user', 65, 63, { crop: crop(4, 0, 11, 19) }),
  chat: asset('icons/chat', 64, 64, { crop: crop(7, 4, 11, 14) }),
  check: asset('icons/check', 59, 63),
  clock: asset('icons/clock', 62, 66),
  warning: asset('icons/warning', 63, 65),
  error: asset('icons/error', 62, 63),
  growth: asset('icons/growth', 65, 64, { crop: crop(5, 2, 11, 16) }),
  star: asset('icons/star', 62, 65),
  trophy: asset('icons/trophy', 60, 68),
  lightning: asset('icons/lightning', 62, 67),
  cpu: asset('icons/cpu', 66, 67, { crop: crop(11, 0, 7, 20) }),
  network: asset('icons/network', 67, 68, { crop: crop(13, 4, 6, 16) }),
}

/* ------------------------------------------------------------------ *
 * Referensi gaya UI (teks tercetak — hanya untuk galeri referensi, tidak
 * pernah dipakai sebagai UI fungsional)
 * ------------------------------------------------------------------ */

export const UI_PREVIEWS = {
  'top-status-hud': asset('ui-previews/top-status-hud', 1238, 60),
  'mission-panel': asset('ui-previews/mission-panel', 243, 192),
  'mission-and-map': asset('ui-previews/mission-and-map', 386, 366),
  'sector-map': asset('ui-previews/sector-map', 278, 126),
  'agent-roster': asset('ui-previews/agent-roster', 485, 394),
  'agent-status-card': asset('ui-previews/agent-status-card', 328, 214),
  'action-buttons': asset('ui-previews/action-buttons', 393, 104),
  'mission-controls': asset('ui-previews/mission-controls', 825, 124),
  'status-badges': asset('ui-previews/status-badges', 333, 215),
  'xp-energy-progress': asset('ui-previews/xp-energy-progress', 252, 198),
  'notification-panel': asset('ui-previews/notification-panel', 251, 121),
  'automation-panel': asset('ui-previews/automation-panel', 343, 112),
  'insight-toast': asset('ui-previews/insight-toast', 230, 70),
  'task-completed-toast': asset('ui-previews/task-completed-toast', 237, 72),
} as const satisfies Record<string, GameAsset>

/** Semua aset terdaftar (dipakai skrip verifikasi dan galeri). */
export function allRegisteredAssets(): GameAsset[] {
  return [
    ...Object.values(CHARACTERS),
    ...Object.values(CHARACTER_STATES),
    ...Object.values(ISLANDS),
    ...Object.values(TILES),
    ...Object.values(FX),
    ...Object.values(BACKGROUNDS),
    ...Object.values(ICONS),
    ...Object.values(UI_PREVIEWS),
  ]
}
