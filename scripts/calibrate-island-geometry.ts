/**
 * Kalibrasi geometri pulau dari ARTWORK (bun run assets:geometry).
 *
 * Untuk setiap pulau, berkas yang benar-benar dirender (`v2Source`) dibaca,
 * lalu diturunkan (koordinat ternormalisasi ke kanvas gambar):
 *  1. visibleBounds — kotak alpha > 16;
 *  2. mask TEBING — batu biru-abu di sisi pulau (warna konsisten antar artwork;
 *     warna tanah di permukaan atas justru bervariasi: rumput, lavender,
 *     oranye tersinari, platform cyan — jadi permukaan TIDAK ditebak dari
 *     warna tanah). Profil tepi atas tebing per kolom = tepi depan permukaan;
 *  3. sudut kiri/kanan (siluet terlebar) dan depan (ujung tebing + profil) →
 *     poligon jalan = pita apron di depan bangunan, disusutkan dari bibir;
 *  4. simpul navigasi/spawn (pusat poligon), dua slot workstation
 *     (kiri-depan, kanan-depan), portal masuk/keluar (kiri-depan), semuanya
 *     dipastikan berada di dalam poligon dan di atas sel permukaan.
 *
 * Keluaran:
 *  - app/game/island-geometry.ts  (dipakai runtime; JANGAN disunting manual)
 *  - tests/fixtures/island-surface.json (mask tebing & alpha 96×64 per pulau;
 *    dipakai test tanpa ImageMagick: anchor tidak di tebing/udara)
 *
 * Opsi: --dry (cetak JSON saja), --preview=<png> (komposit dunia + overlay),
 *       --only=<id,id>. Butuh ImageMagick 7 (`magick`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { insidePolygon, type IslandArtGeometry, type NormalizedPoint } from '../app/game/geometry'
import { ISLAND_KEYS, ISLANDS, MISSION_CITY_BACKGROUND, v2Source, type IslandKey } from '../app/utils/game-assets'
import { STATIONS, energyConnections, hubBox, stationBox, type WorldBox } from '../app/utils/office-layout'
import { readRaster, writeRaster, type Raster } from './lib/raster'

const ROOT = join(import.meta.dir, '..')
const OUTPUT = join(ROOT, 'app/game/island-geometry.ts')
const FIXTURE = join(ROOT, 'tests/fixtures/island-surface.json')
const MASK = { width: 96, height: 64 }

const dry = process.argv.includes('--dry')
const preview = process.argv.find((arg) => arg.startsWith('--preview='))?.slice('--preview='.length)
const inspect = process.argv.find((arg) => arg.startsWith('--inspect='))?.slice('--inspect='.length)
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')

/* ------------------------------------------------------------------ *
 * Klasifikasi piksel
 * ------------------------------------------------------------------ */

/**
 * Tebing/sisi pulau: batu biru-abu/ungu gelap (konsisten di semua artwork),
 * berbeda dari tanah di permukaan atas yang warnanya bervariasi per pulau
 * (rumput hijau, tanah lavender, tanah tersinari oranye, platform cyan).
 * Permukaan atas TIDAK diklasifikasikan dari warna tanah; ia diturunkan dari
 * profil tepi atas tebing per kolom (lihat `analyze`).
 */
const cliff = (r: number, g: number, b: number) => b > r + 30 && b > g + 20 && r < 140 && g < 140
/**
 * Batu gelap saja (tanpa bangunan/plaza ubin biru terang): dipakai untuk
 * validitas anchor dan fixture test ("bukan tebing"). Profil tepi depan tetap
 * memakai `cliff` yang lebih luas agar sorotan batu tidak dikira tanah.
 */
const rock = (r: number, g: number, b: number) => cliff(r, g, b) && 0.2126 * r + 0.7152 * g + 0.0722 * b < 84

/**
 * Pulau yang sengaja dekoratif: kliping v2 kecil yang didominasi bangunan,
 * tanpa permukaan jalan yang dapat dikalibrasi (butuh artwork baru).
 */
const DECORATIVE: readonly IslandKey[] = ['research-lab', 'training-center']

/** Geometri manual (ternormalisasi) untuk artwork yang tidak dapat dikalibrasi otomatis. */
interface ManualGeometry {
  walkablePolygon: NormalizedPoint[]
  navNode: NormalizedPoint
  slots: [NormalizedPoint, NormalizedPoint]
  portal: NormalizedPoint
  reason: string
}

/**
 * Penyesuaian manual (didokumentasikan). Mission Hub: platform cincin berwarna
 * biru/ungu sama seperti batu tebing, sehingga mask tebing tidak dapat
 * membedakan permukaan platform — titik dipilih visual pada kisi 5% artwork
 * (teras rumput kiri/kanan, jalan cincin depan, blok jalan depan-tengah).
 */
const MANUAL: Partial<Record<IslandKey, ManualGeometry>> = {
  'mission-hub': {
    walkablePolygon: [
      { x: 0.22, y: 0.46 },
      { x: 0.34, y: 0.43 },
      { x: 0.5, y: 0.5 },
      { x: 0.66, y: 0.43 },
      { x: 0.78, y: 0.46 },
      { x: 0.5, y: 0.6 },
    ],
    navNode: { x: 0.5, y: 0.54 },
    // Slot kiri dijauhkan dari pad portal (0.31, 0.49) agar robot yang menuju portal tidak
    // menumpuk dengan robot yang bekerja di slot itu (klik jadi ambigu).
    slots: [
      { x: 0.64, y: 0.5 },
      { x: 0.42, y: 0.53 },
    ],
    portal: { x: 0.31, y: 0.49 },
    reason: 'platform cincin biru tidak terpisahkan dari batu tebing oleh warna',
  },
}
/** Penyesuaian bentuk apron per pulau bila diperlukan (saat ini tidak ada). */
const OVERRIDES: Partial<Record<IslandKey, { apron?: Partial<ApronShape> }>> = {}

interface Surface {
  width: number
  height: number
  /** 1 = piksel terlihat (alpha > 16). */
  alpha: Uint8Array
  /** 1 = batu tebing/sisi (klasifikasi luas: termasuk bangunan/ubin biru). */
  cliff: Uint8Array
  /** 1 = batu gelap saja (validitas anchor & fixture). */
  rock: Uint8Array
  /** y tepi atas tebing per kolom (= tepi depan permukaan), -1 bila tidak ada. */
  frontEdge: Int32Array
}

/** Deret non-tebing minimal (px) di atas tebing agar dianggap permukaan, bukan lumut/rumput menjuntai. */
const SURFACE_RUN_PX = 14

function analyze(raster: Raster): Surface {
  const { width, height, data } = raster
  const alpha = new Uint8Array(width * height)
  const cliffMask = new Uint8Array(width * height)
  const rockMask = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i += 1) {
    const a = data[i * 4 + 3] ?? 0
    alpha[i] = a > 16 ? 1 : 0
    const r = data[i * 4] ?? 0
    const g = data[i * 4 + 1] ?? 0
    const b = data[i * 4 + 2] ?? 0
    if (a > 200 && cliff(r, g, b)) cliffMask[i] = 1
    if (a > 200 && rock(r, g, b)) rockMask[i] = 1
  }
  const run = Math.max(4, Math.round((SURFACE_RUN_PX * height) / 1024))
  const frontEdge = new Int32Array(width).fill(-1)
  for (let x = 0; x < width; x += 1) {
    let bottom = -1
    for (let y = height - 1; y >= 0; y -= 1) {
      if (alpha[y * width + x]) {
        bottom = y
        break
      }
    }
    if (bottom < 0) continue
    let nonCliff = 0
    let sawCliff = false
    for (let y = bottom; y >= 0; y -= 1) {
      const i = y * width + x
      if (!alpha[i] || cliffMask[i]) {
        nonCliff = 0
        if (cliffMask[i]) sawCliff = true
        continue
      }
      nonCliff += 1
      if (sawCliff && nonCliff >= run) {
        frontEdge[x] = y + run - 1
        break
      }
    }
  }
  if (process.env.DEBUG_GEOMETRY) {
    const count = (mask: Uint8Array) => mask.reduce((total, value) => total + value, 0)
    const edges = frontEdge.reduce((total, value) => total + (value >= 0 ? 1 : 0), 0)
    console.error(
      `[geometry] ${width}x${height} alpha=${count(alpha)} cliff=${count(cliffMask)} frontEdgeColumns=${edges}`,
    )
  }
  return { width, height, alpha, cliff: cliffMask, rock: rockMask, frontEdge }
}

function bounds(surface: Surface, mask: Uint8Array) {
  let minX = surface.width
  let minY = surface.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      if (!mask[y * surface.width + x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

/** Komponen alpha terbesar (pulau utama) — batu kecil melayang di bawah pulau diabaikan. */
function mainComponent(surface: Surface): Uint8Array {
  const { width, height, alpha } = surface
  const label = new Int32Array(width * height)
  let best = 0
  let bestSize = 0
  let next = 0
  const stack: number[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (!alpha[start] || label[start]) continue
    next += 1
    let size = 0
    stack.push(start)
    label[start] = next
    while (stack.length > 0) {
      const index = stack.pop() as number
      size += 1
      const x = index % width
      const y = (index - x) / width
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const n = ny * width + nx
        if (alpha[n] && !label[n]) {
          label[n] = next
          stack.push(n)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = next
    }
  }
  const main = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i += 1) if (label[i] === best) main[i] = 1
  return main
}

/**
 * Sudut berlian permukaan atas (dari komponen alpha utama):
 * - kiri/kanan = titik TERLEBAR siluet (tebing menyempit di bawahnya);
 *   y = piksel opak teratas pada pita kolom ekstrem;
 * - depan: x = median kolom pada baris-baris terbawah siluet (ujung tebing
 *   tepat di bawah sudut depan); y = median profil tepi atas tebing di
 *   kolom-kolom sekitar x itu.
 */
function extremes(surface: Surface) {
  const { width, height, frontEdge } = surface
  const main = mainComponent(surface)
  const box = bounds(surface, main)
  const band = Math.max(3, Math.round(width / 80))
  const topmostIn = (x0: number, x1: number) => {
    for (let y = 0; y < height; y += 1) {
      for (let x = x0; x <= x1; x += 1) if (main[y * width + x]) return y
    }
    return 0
  }
  const left = { x: box.minX, y: topmostIn(box.minX, box.minX + band) }
  const right = { x: box.maxX, y: topmostIn(box.maxX - band, box.maxX) }
  const bottomXs: number[] = []
  for (let y = box.maxY; y > box.maxY - band * 2 && y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) if (main[y * width + x]) bottomXs.push(x)
  }
  bottomXs.sort((a, b) => a - b)
  const frontX = bottomXs[Math.floor(bottomXs.length / 2)] ?? Math.round((left.x + right.x) / 2)
  const half = Math.max(4, Math.round(width * 0.015))
  const edges: number[] = []
  for (let x = frontX - half; x <= frontX + half; x += 1)
    if ((frontEdge[x] ?? -1) >= 0) edges.push(frontEdge[x] as number)
  edges.sort((a, b) => a - b)
  const frontY = edges[Math.floor(edges.length / 2)] ?? Math.round((left.y + right.y) / 2)
  const span = right.x - left.x
  let edgeColumns = 0
  for (let x = left.x; x <= right.x; x += 1) if ((frontEdge[x] ?? -1) >= 0) edgeColumns += 1
  if (process.env.DEBUG_GEOMETRY) {
    console.error(
      `[geometry] left=${JSON.stringify(left)} right=${JSON.stringify(right)} front=${JSON.stringify({ x: frontX, y: frontY })} edgeCoverage=${(edgeColumns / Math.max(1, span)).toFixed(2)}`,
    )
  }
  return { left, right, front: { x: frontX, y: frontY }, box, edgeCoverage: edgeColumns / Math.max(1, span) }
}

/** Titik sah untuk kaki robot: terlihat dan bukan tebing (diperiksa pada lingkungan kecil). */
function onGround(surface: Surface, p: NormalizedPoint): boolean {
  const cx = Math.round(p.x * surface.width)
  const cy = Math.round(p.y * surface.height)
  // Radius ≈ 1% kanvas = 1 sel mask kasar yang dipakai test, agar anchor tidak di sel campuran.
  const r = Math.max(2, Math.round(surface.width / 100))
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return false
      const i = y * surface.width + x
      if (!surface.alpha[i] || surface.rock[i]) return false
    }
  }
  return true
}

/** Geser titik ke arah `anchor` sampai berada di dalam poligon DAN di atas permukaan. */
function settle(point: NormalizedPoint, anchor: NormalizedPoint, polygon: NormalizedPoint[], surface: Surface) {
  let current = point
  for (let step = 0; step < 60; step += 1) {
    if (insidePolygon(current, polygon) && onGround(surface, current)) return current
    current = { x: current.x + (anchor.x - current.x) * 0.08, y: current.y + (anchor.y - current.y) * 0.08 }
  }
  return current
}

const round = (value: number) => Math.round(value * 10000) / 10000
const norm = (p: { x: number; y: number }, s: Surface): NormalizedPoint => ({
  x: round(p.x / s.width),
  y: round(p.y / s.height),
})
const lerp = (a: NormalizedPoint, b: NormalizedPoint, t: number): NormalizedPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})
const lerpPx = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** Bentuk apron (fraksi) — dapat ditimpa per pulau lewat OVERRIDES. */
interface ApronShape {
  /** Sisi (sudut kiri/kanan) disusutkan ke pusat (fraksi). */
  sideInset: number
  /** Sudut depan dinaikkan dari bibir tebing (fraksi kedalaman depan). */
  frontInset: number
  /** Lebar pita jalan di sayap kiri/kanan: sudut dalam = lerp(sudut luar → pusat, k). */
  wingDepth: number
  /** Lebar pita jalan di depan-tengah (lebih tipis: dasar bangunan dekat bibir depan). */
  frontDepth: number
}
const DEFAULT_APRON: ApronShape = { sideInset: 0.14, frontInset: 0.16, wingDepth: 0.34, frontDepth: 0.14 }

/**
 * Apron = pita rumput di sepanjang dua tepi depan berlian (kiri→depan→kanan),
 * membentuk "U" mengelilingi bangunan: heksagon L' → L'' → F'' → R'' → R' → F'.
 * Bentuknya cekung, karena itu navigasi lokal selalu lewat simpul depan-tengah
 * bila ruas lurus keluar dari poligon (lihat navigation.ts).
 */
function derive(id: IslandKey, surface: Surface): IslandArtGeometry {
  const alphaBox = bounds(surface, surface.alpha)
  const { left, right, front, edgeCoverage } = extremes(surface)
  const shape = { ...DEFAULT_APRON, ...OVERRIDES[id]?.apron }
  const walkable = !DECORATIVE.includes(id) && edgeCoverage >= 0.5
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
  const depth = Math.max(1, front.y - center.y)
  const toward = (p: { x: number; y: number }, target: { x: number; y: number }, k: number) => ({
    x: p.x + (target.x - p.x) * k,
    y: p.y + (target.y - p.y) * k,
  })
  // Sudut kiri/kanan ditempatkan sedikit menuruni tepi depan (di pita tanah, bukan di ujung
  // siluet yang sering ditempati pohon/batu) lalu disusutkan ke pusat.
  const l = toward(lerpPx(left, front, 0.22), center, shape.sideInset)
  const r = toward(lerpPx(right, front, 0.22), center, shape.sideInset)
  const f = { x: front.x, y: front.y - depth * shape.frontInset }
  // Sudut dalam sayap tidak boleh naik di atas garis sudut (zona bangunan/pohon).
  const li = { x: toward(l, center, shape.wingDepth).x, y: Math.max(l.y, toward(l, center, shape.wingDepth).y) }
  const ri = { x: toward(r, center, shape.wingDepth).x, y: Math.max(r.y, toward(r, center, shape.wingDepth).y) }
  const fi = toward(f, center, shape.frontDepth)
  const polygon = [l, li, fi, ri, r, f].map((p) => norm(p, surface))

  const [nl, nli, nfi, nri, nr, nf] = polygon as [
    NormalizedPoint,
    NormalizedPoint,
    NormalizedPoint,
    NormalizedPoint,
    NormalizedPoint,
    NormalizedPoint,
  ]
  // Simpul navigasi di tengah pita depan: "melihat" kedua sayap (poligon berbentuk bintang terhadapnya).
  const mid = lerp(nf, nfi, 0.5)
  const navNode =
    [mid, lerp(mid, nfi, 0.3), lerp(mid, nf, 0.3), lerp(mid, nl, 0.12), lerp(mid, nr, 0.12)].find(
      (p) => insidePolygon(p, polygon) && onGround(surface, p),
    ) ?? settle(mid, mid, polygon, surface)
  const bandLeft = (t: number) => lerp(lerp(nl, nf, t), lerp(nli, nfi, t), 0.5)
  const bandRight = (t: number) => lerp(lerp(nr, nf, t), lerp(nri, nfi, t), 0.5)
  // Pilih kandidat pertama di sepanjang pita yang berada di dalam poligon dan di atas permukaan.
  const firstValid = (candidates: NormalizedPoint[]) =>
    candidates.find((p) => insidePolygon(p, polygon) && onGround(surface, p)) ??
    settle(candidates[0] as NormalizedPoint, navNode, polygon, surface)
  // Kandidat: titik pita, lalu digeser ke arah simpul (tengah depan) dan ke arah tepi dalam/luar.
  const inner = (t: number, side: 'l' | 'r') => (side === 'l' ? lerp(nli, nfi, t) : lerp(nri, nfi, t))
  const outerPt = (t: number, side: 'l' | 'r') => (side === 'l' ? lerp(nl, nf, t) : lerp(nr, nf, t))
  const along = (band: (t: number) => NormalizedPoint, ts: number[], side: 'l' | 'r') =>
    ts.flatMap((t) => [
      band(t),
      lerp(band(t), navNode, 0.15),
      lerp(band(t), inner(t, side), 0.5),
      lerp(band(t), outerPt(t, side), 0.4),
      lerp(band(t), navNode, 0.3),
    ])
  const slotRight = firstValid(along(bandRight, [0.38, 0.3, 0.46, 0.22, 0.54, 0.62], 'r'))
  const slotLeft = firstValid(along(bandLeft, [0.38, 0.3, 0.46, 0.22, 0.54, 0.62], 'l'))
  const portal = firstValid(along(bandLeft, [0.74, 0.8, 0.68, 0.86, 0.6], 'l'))
  if (process.env.DEBUG_GEOMETRY) {
    const area = Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length]!
        return sum + p.x * q.y - q.x * p.y
      }, 0) / 2,
    )
    console.error(`[geometry] ${id} apronArea=${(area * 100).toFixed(2)}% of canvas`)
  }

  const manual = MANUAL[id]
  if (manual) {
    return {
      assetId: id,
      walkable: true,
      calibration: 'manual',
      sourceWidth: surface.width,
      sourceHeight: surface.height,
      visibleBounds: {
        x: round(alphaBox.minX / surface.width),
        y: round(alphaBox.minY / surface.height),
        width: round((alphaBox.maxX - alphaBox.minX + 1) / surface.width),
        height: round((alphaBox.maxY - alphaBox.minY + 1) / surface.height),
      },
      walkablePolygon: manual.walkablePolygon,
      navNode: manual.navNode,
      spawnPoint: manual.navNode,
      workstationSlots: manual.slots.map((slot, index) => ({ id: `slot-${index}`, ...slot })),
      portalEntry: manual.portal,
      portalExit: manual.portal,
    }
  }
  if (!walkable) {
    // Artwork tidak memiliki permukaan jalan yang dapat dikalibrasi (mis. kliping v2 kecil yang
    // didominasi bangunan): pulau dekoratif — tanpa slot, tanpa portal, di luar graf navigasi.
    const vc = {
      x: round((alphaBox.minX + alphaBox.maxX) / 2 / surface.width),
      y: round((alphaBox.minY + alphaBox.maxY) / 2 / surface.height),
    }
    return {
      assetId: id,
      walkable: false,
      calibration: 'auto',
      sourceWidth: surface.width,
      sourceHeight: surface.height,
      visibleBounds: {
        x: round(alphaBox.minX / surface.width),
        y: round(alphaBox.minY / surface.height),
        width: round((alphaBox.maxX - alphaBox.minX + 1) / surface.width),
        height: round((alphaBox.maxY - alphaBox.minY + 1) / surface.height),
      },
      walkablePolygon: [],
      navNode: vc,
      spawnPoint: vc,
      workstationSlots: [],
      portalEntry: vc,
      portalExit: vc,
    }
  }
  return {
    assetId: id,
    walkable: true,
    calibration: 'auto',
    sourceWidth: surface.width,
    sourceHeight: surface.height,
    visibleBounds: {
      x: round(alphaBox.minX / surface.width),
      y: round(alphaBox.minY / surface.height),
      width: round((alphaBox.maxX - alphaBox.minX + 1) / surface.width),
      height: round((alphaBox.maxY - alphaBox.minY + 1) / surface.height),
    },
    walkablePolygon: polygon.map((p) => ({ x: round(p.x), y: round(p.y) })),
    navNode: { x: round(navNode.x), y: round(navNode.y) },
    spawnPoint: { x: round(navNode.x), y: round(navNode.y) },
    workstationSlots: [
      { id: 'slot-0', x: round(slotRight.x), y: round(slotRight.y) },
      { id: 'slot-1', x: round(slotLeft.x), y: round(slotLeft.y) },
    ],
    portalEntry: { x: round(portal.x), y: round(portal.y) },
    portalExit: { x: round(portal.x), y: round(portal.y) },
  }
}

/** Gambar diagnostik per pulau: art + mask permukaan (magenta) + poligon & titik. */
function writeInspection(id: IslandKey, raster: Raster, surface: Surface, geometry: IslandArtGeometry, dir: string) {
  const tinted: Raster = { width: raster.width, height: raster.height, data: new Uint8ClampedArray(raster.data) }
  for (let i = 0; i < surface.width * surface.height; i += 1) {
    if (!surface.rock[i]) continue
    tinted.data[i * 4] = Math.round((tinted.data[i * 4] ?? 0) * 0.4)
    tinted.data[i * 4 + 1] = Math.round((tinted.data[i * 4 + 1] ?? 0) * 0.4 + 255 * 0.6)
    tinted.data[i * 4 + 2] = Math.round((tinted.data[i * 4 + 2] ?? 0) * 0.4)
  }
  for (let x = 0; x < surface.width; x += 1) {
    const y = surface.frontEdge[x] ?? -1
    if (y < 0) continue
    for (let dy = -2; dy <= 2; dy += 1) {
      const i = (y + dy) * surface.width + x
      if (i < 0 || i >= surface.width * surface.height) continue
      tinted.data[i * 4] = 255
      tinted.data[i * 4 + 1] = 230
      tinted.data[i * 4 + 2] = 0
    }
  }
  const file = join(dir, `${id}.png`)
  const w = (p: NormalizedPoint) => `${(p.x * surface.width).toFixed(1)},${(p.y * surface.height).toFixed(1)}`
  const draws: string[] = []
  if (geometry.walkablePolygon.length >= 3) {
    draws.push(
      `fill rgba(0,255,255,0.25) stroke cyan stroke-width 3 polygon ${geometry.walkablePolygon.map(w).join(' ')}`,
    )
  }
  const dot = (p: NormalizedPoint, color: string, r: number) => {
    const [x, y] = w(p).split(',').map(Number)
    draws.push(`fill ${color} stroke black stroke-width 2 circle ${x},${y} ${(x ?? 0) + r},${y}`)
  }
  dot(geometry.navNode, 'lime', 8)
  dot(geometry.portalEntry, 'yellow', 10)
  for (const slot of geometry.workstationSlots) dot(slot, 'red', 10)
  mkdirSync(dir, { recursive: true })
  writeRaster(tinted, file, ['-background', '#ff00ff', '-flatten', '-draw', draws.join(' ')])
}

/** Mask kasar (96×64) untuk test: '1' bila mayoritas piksel sel termasuk. */
function coarseMask(surface: Surface, mask: Uint8Array): string[] {
  const rows: string[] = []
  for (let cy = 0; cy < MASK.height; cy += 1) {
    let row = ''
    for (let cx = 0; cx < MASK.width; cx += 1) {
      const x0 = Math.floor((cx * surface.width) / MASK.width)
      const x1 = Math.floor(((cx + 1) * surface.width) / MASK.width)
      const y0 = Math.floor((cy * surface.height) / MASK.height)
      const y1 = Math.floor(((cy + 1) * surface.height) / MASK.height)
      let hit = 0
      let total = 0
      for (let y = y0; y < y1; y += 1)
        for (let x = x0; x < x1; x += 1) {
          total += 1
          hit += mask[y * surface.width + x] ?? 0
        }
      row += hit * 2 >= total && total > 0 ? '1' : '0'
    }
    rows.push(row)
  }
  return rows
}

/* ------------------------------------------------------------------ *
 * Jalankan
 * ------------------------------------------------------------------ */

const geometries: Record<string, IslandArtGeometry> = {}
const fixtures: Record<string, { cliff: string[]; alpha: string[] }> = {}

for (const id of ISLAND_KEYS) {
  if (only && !only.includes(id)) continue
  const source = v2Source(ISLANDS[id])
  if (!source) throw new Error(`Pulau ${id} tidak punya berkas render`)
  const raster = readRaster(join(ROOT, 'public', source.src))
  const surface = analyze(raster)
  geometries[id] = derive(id, surface)
  fixtures[id] = { cliff: coarseMask(surface, surface.rock), alpha: coarseMask(surface, surface.alpha) }
  if (inspect) writeInspection(id, raster, surface, geometries[id], inspect)
}

if (dry) console.log(JSON.stringify(geometries, null, 2))

if (preview) {
  // Komposit dunia (latar + pulau pada kotak render) + overlay geometri, untuk verifikasi visual.
  const S = 1
  const boxes = new Map<IslandKey, WorldBox>()
  for (const station of STATIONS) boxes.set(station.id, stationBox(station))
  boxes.set('mission-hub', hubBox())
  const z = (id: IslandKey) => (id === 'mission-hub' ? 44 : 40 + Math.round((boxes.get(id)?.top ?? 0) / 100))
  const order = [...boxes.keys()].sort((a, b) => z(a) - z(b))
  const args = [join(ROOT, 'public', MISSION_CITY_BACKGROUND.src), '-resize', `${1672 * S}x${941 * S}!`]
  const lines = energyConnections().map(
    ({ curve: c }) =>
      `stroke rgba(255,140,0,0.6) stroke-width 2 fill none path 'M ${c.start.x},${c.start.y} Q ${c.control.x},${c.control.y} ${c.end.x},${c.end.y}'`,
  )
  args.push('-draw', lines.join(' '))
  for (const id of order) {
    const box = boxes.get(id)
    const source = v2Source(ISLANDS[id])
    if (!box || !source) continue
    args.push(
      '(',
      join(ROOT, 'public', source.src),
      '-resize',
      `${Math.round(box.width)}x${Math.round(box.height)}!`,
      ')',
    )
    args.push('-geometry', `+${Math.round(box.left)}+${Math.round(box.top)}`, '-composite')
  }
  const draws: string[] = []
  for (const [id, geometry] of Object.entries(geometries)) {
    const box = boxes.get(id as IslandKey)
    if (!box) continue
    const w = (p: NormalizedPoint) =>
      `${(box.left + p.x * box.width).toFixed(1)},${(box.top + p.y * box.height).toFixed(1)}`
    const vb = geometry.visibleBounds
    draws.push(
      `fill none stroke rgba(255,255,255,0.5) stroke-width 1 rectangle ${w({ x: vb.x, y: vb.y })} ${w({ x: vb.x + vb.width, y: vb.y + vb.height })}`,
    )
    if (geometry.walkablePolygon.length >= 3) {
      draws.push(
        `fill rgba(0,255,255,0.22) stroke cyan stroke-width 1.5 polygon ${geometry.walkablePolygon.map(w).join(' ')}`,
      )
    }
    if (!geometry.walkable) continue
    const dot = (p: NormalizedPoint, color: string, r: number) => {
      const [x, y] = w(p).split(',').map(Number)
      draws.push(`fill ${color} stroke black stroke-width 1 circle ${x},${y} ${(x ?? 0) + r},${y}`)
    }
    dot(geometry.navNode, 'lime', 3)
    dot(geometry.portalEntry, 'yellow', 4)
    for (const slot of geometry.workstationSlots) dot(slot, 'red', 4)
  }
  args.push('-draw', draws.join(' '), preview)
  const result = Bun.spawnSync(['magick', ...args], { stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  console.log(`Pratinjau: ${preview}`)
}

if (!dry && !only) {
  const entries = ISLAND_KEYS.map((id) => `  '${id}': ${JSON.stringify(geometries[id])},`).join('\n')
  const source = `/*
 * DIHASILKAN oleh scripts/calibrate-island-geometry.ts dari artwork pulau —
 * jangan disunting manual (jalankan \`bun run assets:geometry\`). Koordinat
 * ternormalisasi ke kanvas gambar yang dirender; lihat geometry.ts.
 */
import type { IslandArtGeometry } from './geometry'
import type { IslandKey } from '../utils/game-assets'

export const ISLAND_ART_GEOMETRY: Record<IslandKey, IslandArtGeometry> = {
${entries}
}
`
  writeFileSync(OUTPUT, source)
  mkdirSync(dirname(FIXTURE), { recursive: true })
  writeFileSync(FIXTURE, `${JSON.stringify({ mask: MASK, islands: fixtures })}\n`)
  Bun.spawnSync(['bunx', 'prettier', '--write', OUTPUT], { cwd: ROOT })
  console.log(`Ditulis: ${OUTPUT} dan ${FIXTURE} (${Object.keys(geometries).length} pulau)`)
}
