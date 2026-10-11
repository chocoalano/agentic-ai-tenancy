/**
 * Verifikasi integrasi asset pack "Neon Mission Map" (bun run check:assets).
 *
 *  1. Manifest (public/game-assets/asset-manifest.json) valid.
 *  2. Setiap file di manifest ada dan dimensinya cocok dengan header PNG.
 *  3. Registry (app/utils/game-assets.ts) hanya menunjuk aset nyata dengan
 *     dimensi sesuai manifest dan kliping di dalam batas gambar.
 *  4. Aset wajib terdaftar di registry.
 *  5. Aset wajib benar-benar dipakai komponen/scene (bukan hanya disalin).
 *  6. Tidak ada path /game-assets/... di kode frontend yang hilang atau ditulis
 *     di luar registry.
 *  7. Varian v2 (bun run assets:v2) ada: WebP alpha dengan dimensi = area
 *     terlihat × faktor `v2`.
 *  8. Sprite sheet animasi per karakter (agents/{karakter}/sheet.webp +
 *     atlas.json) mengikuti kontrak app/game/animation-spec.ts.
 *  9. Tidak ada aset yatim di public/game-assets-v2: setiap berkas runtime
 *     dirujuk registry (master PNG/turunan tak terpakai tidak ikut deploy).
 *
 * Keluar dengan kode 1 bila ada pemeriksaan yang gagal.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  BACKGROUNDS,
  MISSION_CITY_BACKGROUND,
  CHARACTER_KEYS,
  FX_KEYS,
  ISLAND_KEYS,
  TILE_KEYS,
  CHARACTER_STATE_KEYS,
  allRegisteredAssets,
  v2Source,
  type GameAsset,
} from '../app/utils/game-assets'
import {
  AGENT_ANCHOR,
  AGENT_ANIMATIONS,
  AGENT_FRAME,
  AGENT_SHEET,
  ANIMATION_ROWS,
  agentSheetSource,
} from '../app/game/animation-spec'
import { MISSION_HUB, STATIONS, TERRAIN_DECOR, WORLD_FX } from '../app/utils/office-layout'
import { PREVIEW_CAST } from '../app/utils/office-preview'

const ROOT = join(import.meta.dir, '..')
const PUBLIC_DIR = join(ROOT, 'public')
const MANIFEST_PATH = join(PUBLIC_DIR, 'game-assets', 'asset-manifest.json')
const REGISTRY_FILE = 'app/utils/game-assets.ts'

const REQUIRED = {
  characters: ['nova', 'sage', 'pixel', 'bolt', 'echo'],
  characterStates: ['idle', 'thinking', 'working', 'researching', 'analyzing', 'generating', 'success'],
  islands: [
    'mission-hub',
    'web-research',
    'data-warehouse',
    'client-brief',
    'knowledge-base',
    'analytics-tool',
    'report-builder',
  ],
  tiles: ['cloud', 'grass', 'purple-grass', 'purple-forest', 'evergreen-trees', 'crystal-rock'],
  fx: [
    'portal-cyan',
    'portal-violet',
    'energy-ring',
    'energy-spawn',
    'hologram-cube',
    'particles-cyan',
    'particles-purple',
    'connection-path',
  ],
  backgrounds: ['city-skyline'],
} as const

interface ManifestAsset {
  id: string
  path: string
  category: string
  width: number
  height: number
}

const failures: string[] = []
const passes: string[] = []

function check(condition: boolean, message: string, detail?: string) {
  if (condition) passes.push(message)
  else failures.push(detail ? `${message} — ${detail}` : message)
}

function isManifestAsset(value: unknown): value is ManifestAsset {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'path' in value &&
    typeof value.path === 'string' &&
    'category' in value &&
    typeof value.category === 'string' &&
    'width' in value &&
    typeof value.width === 'number' &&
    'height' in value &&
    typeof value.height === 'number'
  )
}

/** Dimensi dari chunk IHDR PNG (byte 16–23, big-endian). */
function pngSize(file: string): { width: number; height: number } | null {
  const bytes = readFileSync(file)
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Dimensi WebP dari header RIFF (VP8X / VP8L / VP8). */
function webpSize(file: string): { width: number; height: number } | null {
  const bytes = readFileSync(file)
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }
  const chunk = bytes.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  return null
}

function publicFile(url: string): string {
  return join(PUBLIC_DIR, ...url.split('/').filter(Boolean))
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

function missing(required: readonly string[], available: Iterable<string>): string[] {
  const set = new Set(available)
  return required.filter((key) => !set.has(key))
}

// 1. Manifest -------------------------------------------------------------
let manifest: ManifestAsset[] = []
try {
  const parsed: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const assets = typeof parsed === 'object' && parsed !== null && 'assets' in parsed ? parsed.assets : null
  check(Array.isArray(assets), 'Manifest memiliki array "assets"')
  if (Array.isArray(assets)) {
    const invalid = assets.filter((item) => !isManifestAsset(item))
    check(
      invalid.length === 0,
      'Semua entri manifest memiliki id/path/category/width/height',
      `${invalid.length} entri tidak valid`,
    )
    manifest = assets.filter(isManifestAsset)
    const ids = manifest.map((item) => item.id)
    check(new Set(ids).size === ids.length, 'ID manifest unik')
    const badPaths = manifest.filter((item) => item.path !== `/game-assets/${item.id}.png`)
    check(badPaths.length === 0, 'Path manifest = /game-assets/<id>.png', badPaths.map((item) => item.id).join(', '))
  }
} catch (error) {
  check(false, 'Manifest dapat dibaca sebagai JSON', error instanceof Error ? error.message : String(error))
}

// 2. File manifest ada & dimensi cocok -----------------------------------
const manifestById = new Map(manifest.map((item) => [item.id, item]))
const missingFiles: string[] = []
const wrongSize: string[] = []
for (const item of manifest) {
  const file = publicFile(item.path)
  if (!existsSync(file)) {
    missingFiles.push(item.path)
    continue
  }
  const size = pngSize(file)
  if (!size || size.width !== item.width || size.height !== item.height) {
    wrongSize.push(
      `${item.id} (manifest ${item.width}×${item.height}, file ${size ? `${size.width}×${size.height}` : 'bukan PNG'})`,
    )
  }
}
check(missingFiles.length === 0, `Semua ${manifest.length} file manifest ada di public/`, missingFiles.join(', '))
check(wrongSize.length === 0, 'Dimensi PNG cocok dengan manifest', wrongSize.join('; '))

// 3. Registry → manifest & file ------------------------------------------
const registered = allRegisteredAssets()
const registryProblems: string[] = []
for (const item of registered) {
  const entry = manifestById.get(item.id)
  if (!entry) {
    registryProblems.push(`${item.id}: tidak ada di manifest`)
    continue
  }
  if (item.src !== entry.path) registryProblems.push(`${item.id}: src ${item.src} ≠ ${entry.path}`)
  if (item.width !== entry.width || item.height !== entry.height) registryProblems.push(`${item.id}: dimensi berbeda`)
  if (!existsSync(publicFile(item.src))) registryProblems.push(`${item.id}: file ${item.src} tidak ada`)
  const crop = item.crop
  if (crop) {
    const values = [crop.top, crop.right, crop.bottom, crop.left]
    if (
      values.some((value) => value < 0) ||
      crop.left + crop.right >= item.width ||
      crop.top + crop.bottom >= item.height
    ) {
      registryProblems.push(`${item.id}: crop di luar batas gambar`)
    }
  }
}
check(
  registryProblems.length === 0,
  `Registry (${registered.length} aset) menunjuk file nyata sesuai manifest`,
  registryProblems.join('; '),
)

// 4. Aset wajib terdaftar -------------------------------------------------
const registeredIds = new Set(registered.map((item: GameAsset) => item.id))
const requiredIds = [
  ...REQUIRED.characters.map((key) => `characters/${key}`),
  ...REQUIRED.characterStates.map((key) => `character-states/${key}`),
  ...REQUIRED.islands.map((key) => `islands/${key}`),
  ...REQUIRED.tiles.map((key) => `tiles/${key}`),
  ...REQUIRED.fx.map((key) => `fx/${key}`),
  ...REQUIRED.backgrounds.map((key) => `backgrounds/${key}`),
]
check(
  requiredIds.every((id) => registeredIds.has(id)),
  `${requiredIds.length} aset wajib terdaftar di registry`,
  requiredIds.filter((id) => !registeredIds.has(id)).join(', '),
)
check(missing(REQUIRED.characters, CHARACTER_KEYS).length === 0, 'Kelima karakter ada di CHARACTER_KEYS')
check(missing(REQUIRED.islands, ISLAND_KEYS).length === 0, 'Pulau wajib ada di ISLAND_KEYS')
check(missing(REQUIRED.tiles, TILE_KEYS).length === 0, 'Tile wajib ada di TILE_KEYS')
check(missing(REQUIRED.fx, FX_KEYS).length === 0, 'Efek wajib ada di FX_KEYS')
check('city-skyline' in BACKGROUNDS, 'Latar city-skyline terdaftar')

// 5. Aset wajib dipakai komponen -----------------------------------------
const frontendFiles = [...new Bun.Glob('app/**/*.{vue,ts}').scanSync({ cwd: ROOT })].filter(
  (file) => !file.startsWith('app/components/ui/'),
)
const sources = new Map(frontendFiles.map((file) => [file, read(file)]))
const allSource = [...sources.values()].join('\n')

/** Kunci yang dirujuk lewat `GROUP.key` atau `GROUP['key']` di kode frontend. */
function referencedKeys(group: string): Set<string> {
  const keys = new Set<string>()
  const pattern = new RegExp(`${group}(?:\\.([a-zA-Z]+)|\\['([a-z-]+)'\\])`, 'g')
  for (const match of allSource.matchAll(pattern)) keys.add(match[1] ?? match[2] ?? '')
  return keys
}

function uses(file: string, ...needles: string[]): boolean {
  const source = sources.get(file) ?? ''
  return needles.every((needle) => source.includes(needle))
}

// Karakter: AgentSprite merender CHARACTERS[...] (avatar/daftar); dunia merender OfficeActor
// dengan sprite sheet animasi v2; mode pratinjau & galeri menampilkan kelimanya.
check(
  uses('app/components/office/AgentSprite.vue', 'CHARACTERS[props.character]'),
  'AgentSprite merender sprite characters/*.png',
)
check(
  uses('app/components/office/OfficeActor.vue', 'agentSheetSource(', 'bridge?.register('),
  'OfficeActor (dunia) merender sprite sheet animasi v2 yang digerakkan renderer mesin',
)
check(uses('app/components/office/GameWorld.vue', '<OfficeActor'), 'GameWorld merender OfficeActor')
check(uses('app/components/agents/AgentAvatar.vue', '<AgentSprite'), 'AgentAvatar memakai sprite robot PNG')
const layoutSource = read('app/utils/office-layout.ts')
check(
  REQUIRED.characters.every((key) => layoutSource.includes(`['${key}', [`)),
  'Pemetaan karakter (characterForAgent) mencakup kelima karakter',
)
check(
  missing(
    REQUIRED.characters,
    PREVIEW_CAST.map((member) => member.character),
  ).length === 0,
  'Mode pratinjau menampilkan kelima karakter di dunia',
)
check(
  uses('app/pages/office/assets.vue', 'v-for="key in CHARACTER_KEYS"', '<AgentSprite'),
  'Galeri pratinjau menampilkan kelima karakter',
)

// Pose karakter: terpotong di sumber (audit: perlu dibuat ulang) → tidak dipakai sebagai
// animasi dunia; ditampilkan lengkap di galeri sebagai referensi.
check(
  missing(REQUIRED.characterStates, CHARACTER_STATE_KEYS).length === 0 &&
    uses('app/pages/office/assets.vue', 'v-for="key in CHARACTER_STATE_KEYS"', 'CHARACTER_STATES[key]'),
  'Pose karakter wajib terdaftar dan ditampilkan di galeri (bukan animasi dunia — lihat laporan kualitas)',
  missing(REQUIRED.characterStates, CHARACTER_STATE_KEYS).join(', '),
)

// Pulau
const sceneIslands = new Set<string>([MISSION_HUB.island, ...STATIONS.map((station) => station.id)])
check(
  missing(REQUIRED.islands, sceneIslands).length === 0,
  `Dunia memuat ${sceneIslands.size} pulau termasuk semua pulau wajib`,
  missing(REQUIRED.islands, sceneIslands).join(', '),
)
check(sceneIslands.size >= 7, 'Minimal tujuh pulau/bangunan di dunia desktop')
check(uses('app/components/office/OfficeIsland.vue', 'ISLANDS[definition.id]'), 'OfficeIsland merender islands/*.png')
check(
  uses('app/components/office/MissionHub.vue', "ISLANDS['mission-hub']"),
  'MissionHub merender islands/mission-hub.png',
)
check(
  uses(
    'app/components/office/GameWorld.vue',
    '<OfficeTerrain',
    '<EnergyConnections',
    '<OfficeIsland',
    '<MissionHub',
    '<OfficeEffects',
    '<OfficeActor',
    '<OfficeLabels',
  ),
  'GameWorld menyusun semua lapisan dunia',
)

// Lingkungan & efek
const usedTiles = new Set<string>([...TERRAIN_DECOR.map((item) => item.tile), ...referencedKeys('TILES')])
check(
  missing(REQUIRED.tiles, usedTiles).length === 0,
  'Tile wajib dipakai di dunia',
  missing(REQUIRED.tiles, usedTiles).join(', '),
)
check(uses('app/components/office/OfficeTerrain.vue', 'TERRAIN_DECOR'), 'OfficeTerrain merender TERRAIN_DECOR')
const usedFx = new Set<string>([...WORLD_FX.map((item) => item.fx), ...referencedKeys('FX')])
check(missing(REQUIRED.fx, usedFx).length === 0, 'Efek wajib dipakai', missing(REQUIRED.fx, usedFx).join(', '))
check(uses('app/components/office/OfficeEffects.vue', 'WORLD_FX'), 'OfficeEffects merender WORLD_FX')
check(
  uses('app/components/office/GameBackdrop.vue', "BACKGROUNDS['city-skyline']"),
  'GameBackdrop merender city-skyline.png',
)
check(
  uses('app/components/office/GameOffice.vue', '<GameBackdrop', '<GameWorld', '<GameHUD', '<GameCommandBar'),
  'GameOffice memuat latar, dunia, HUD, dan command bar',
)
check(uses('app/pages/office/index.vue', "layout: 'game'", '<GameOffice'), '/office memakai layout game layar penuh')

// 6. Path lokal di kode frontend -----------------------------------------
const literalProblems: string[] = []
const pathPattern = /\/game-assets(?:-v2)?\/[\w./-]+\.(?:png|jpe?g|webp|svg|json)/g
for (const file of [...frontendFiles, ...new Bun.Glob('app/**/*.css').scanSync({ cwd: ROOT })]) {
  const source = sources.get(file) ?? read(file)
  for (const match of source.matchAll(pathPattern)) {
    const url = match[0]
    if (!existsSync(publicFile(url))) literalProblems.push(`${file}: ${url} tidak ada`)
    else if (file !== REGISTRY_FILE) literalProblems.push(`${file}: path ${url} ditulis di luar registry`)
  }
}
check(
  literalProblems.length === 0,
  'Tidak ada path /game-assets(-v2)/ yang hilang atau tersebar di luar registry',
  literalProblems.join('; '),
)

// 7. Varian v2 ---------------------------------------------------------------
const v2Problems: string[] = []
let v2Count = 0
for (const item of registered) {
  const v2 = v2Source(item)
  if (!v2) continue
  v2Count += 1
  const file = publicFile(v2.src)
  if (!existsSync(file)) {
    v2Problems.push(`${v2.src} tidak ada (jalankan bun run assets:v2)`)
    continue
  }
  const size = v2.src.endsWith('.png') ? pngSize(file) : webpSize(file)
  if (!size || size.width !== v2.width || size.height !== v2.height) {
    v2Problems.push(
      `${v2.src} berdimensi ${size ? `${size.width}×${size.height}` : 'bukan WebP'}, harus ${v2.width}×${v2.height}`,
    )
  }
}
check(v2Problems.length === 0, `${v2Count} varian artwork ada dengan dimensi yang benar`, v2Problems.join('; '))
const cityFile = publicFile(MISSION_CITY_BACKGROUND.src)
const citySize = existsSync(cityFile)
  ? MISSION_CITY_BACKGROUND.src.endsWith('.png')
    ? pngSize(cityFile)
    : webpSize(cityFile)
  : null
check(
  citySize?.width === MISSION_CITY_BACKGROUND.width && citySize.height === MISSION_CITY_BACKGROUND.height,
  'Latar kota rekonstruksi ada dengan dimensi yang benar',
)

// 8. Sprite sheet animasi ------------------------------------------------------
const sheetProblems: string[] = []
const expectedSheet = {
  width: AGENT_FRAME.width * AGENT_SHEET.columns,
  height: AGENT_FRAME.height * AGENT_SHEET.rows,
}
for (const character of CHARACTER_KEYS) {
  const source = agentSheetSource(character)
  const sheetFile = publicFile(source.src)
  const atlasFile = publicFile(source.atlas)
  if (!existsSync(sheetFile) || !existsSync(atlasFile)) {
    sheetProblems.push(`${character}: sheet/atlas tidak ada (jalankan bun run assets:v2)`)
    continue
  }
  const size = webpSize(sheetFile)
  if (!size || size.width !== expectedSheet.width || size.height !== expectedSheet.height) {
    sheetProblems.push(`${character}: sheet ${size ? `${size.width}×${size.height}` : 'bukan WebP'}`)
  }
  const atlas: unknown = JSON.parse(readFileSync(atlasFile, 'utf8'))
  if (typeof atlas !== 'object' || atlas === null || !('animations' in atlas) || !('anchor' in atlas)) {
    sheetProblems.push(`${character}: atlas tanpa animations/anchor`)
    continue
  }
  if (JSON.stringify(atlas.anchor) !== JSON.stringify(AGENT_ANCHOR)) sheetProblems.push(`${character}: anchor berbeda`)
  const animations = atlas.animations
  for (const [row, name] of ANIMATION_ROWS.entries()) {
    const entry: unknown = typeof animations === 'object' && animations !== null ? Reflect.get(animations, name) : null
    const frames = typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'frames') : null
    const fps = typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'fps') : null
    if (
      !Array.isArray(frames) ||
      frames.length !== AGENT_ANIMATIONS[name].frames ||
      fps !== AGENT_ANIMATIONS[name].fps
    ) {
      sheetProblems.push(`${character}: animasi ${name} tidak cocok dengan animation-spec`)
      continue
    }
    const first: unknown = frames[0]
    if (typeof first !== 'object' || first === null || Reflect.get(first, 'y') !== row * AGENT_FRAME.height) {
      sheetProblems.push(`${character}: baris animasi ${name} bukan ${row}`)
    }
  }
}
check(
  sheetProblems.length === 0,
  `${CHARACTER_KEYS.length} sprite sheet animasi (${ANIMATION_ROWS.length} animasi) mengikuti kontrak animation-spec`,
  sheetProblems.join('; '),
)

// 9. Aset yatim di public/game-assets-v2 ---------------------------------------
// Semua berkas runtime harus dirujuk registry (varian artwork, sheet+atlas robot, latar);
// berkas sumber/master (PNG hasil generate, turunan yang tidak dipakai) tidak boleh ikut terkirim.
const referenced = new Set<string>()
for (const item of registered) {
  const v2 = v2Source(item)
  if (v2) referenced.add(publicFile(v2.src))
}
for (const character of CHARACTER_KEYS) {
  const source = agentSheetSource(character)
  referenced.add(publicFile(source.src))
  referenced.add(publicFile(source.atlas))
}
referenced.add(publicFile(MISSION_CITY_BACKGROUND.src))
const v2Root = join(PUBLIC_DIR, 'game-assets-v2')
const orphans = [...new Bun.Glob('**/*').scanSync({ cwd: v2Root, onlyFiles: true })]
  .map((file) => join(v2Root, file))
  .filter((file) => !referenced.has(file))
  .map((file) => relative(PUBLIC_DIR, file))
check(
  orphans.length === 0,
  `Tidak ada aset yatim di public/game-assets-v2 (${referenced.size} berkas runtime dirujuk registry)`,
  orphans.join(', '),
)

// Laporan -----------------------------------------------------------------
for (const message of passes) console.log(`✓ ${message}`)
for (const message of failures) console.error(`✖ ${message}`)
console.log(
  `\n${failures.length === 0 ? '✓' : '✖'} ${passes.length} lulus, ${failures.length} gagal (${relative(ROOT, MANIFEST_PATH)}).`,
)
if (failures.length > 0) process.exitCode = 1
