/*
 * Kontrak geometri art → dunia untuk pulau.
 *
 * Setiap pulau dirender dari satu berkas gambar (kanvas penuh, termasuk
 * margin transparan). Semua koordinat di sini DINORMALKAN ke kanvas gambar
 * yang dipakai saat render (`v2Source(asset)`): (0,0) = sudut kiri atas
 * kanvas, (1,1) = kanan bawah. Dipetakan ke unit dunia lewat kotak render
 * pulau (`WorldBox`): x_dunia = box.left + nx × box.width, y_dunia = box.top +
 * ny × box.height. Kamera (zoom/geser) bekerja pada seluruh panggung, jadi
 * pemetaan ini tidak berubah saat zoom atau ukuran viewport berubah.
 *
 * Dibedakan secara eksplisit:
 * - kanvas penuh vs `visibleBounds` (alpha > 0),
 * - permukaan atas yang dapat dijalani (`walkablePolygon`) vs tebing/sisi dan
 *   bangunan (opak tetapi BUKAN tempat berdiri),
 * - titik interaksi: spawn, simpul navigasi, slot workstation, portal
 *   masuk/keluar.
 *
 * Nilainya diturunkan dari artwork asli oleh `scripts/calibrate-island-geometry.ts`
 * (hasil di `island-geometry.ts`, jangan disunting manual) dan diverifikasi
 * oleh tests/unit/office-geometry.test.ts terhadap mask permukaan artwork.
 */

export interface NormalizedPoint {
  x: number
  y: number
}

export interface IslandArtGeometry {
  assetId: string
  /**
   * false = artwork tidak punya permukaan jalan yang dapat dikalibrasi; pulau
   * dekoratif: tanpa slot/portal dan di luar graf navigasi (titik lain = pusat terlihat).
   */
  walkable: boolean
  /**
   * `auto` = diturunkan dari mask tebing/profil tepi artwork dan diverifikasi
   * test terhadap mask; `manual` = dikalibrasi visual (artwork tanpa pemisahan
   * warna tebing/platform yang andal, mis. Mission Hub) — tetap diverifikasi
   * test untuk kontainmen & alpha, dan secara visual lewat overlay dev.
   */
  calibration: 'auto' | 'manual'
  /** Ukuran kanvas gambar yang dirender (px). */
  sourceWidth: number
  sourceHeight: number
  /** Kotak piksel terlihat (alpha > 0), ternormalisasi. */
  visibleBounds: { x: number; y: number; width: number; height: number }
  /** Permukaan atas yang dapat dijalani (poligon cembung, searah jarum jam), ternormalisasi. */
  walkablePolygon: NormalizedPoint[]
  /** Simpul navigasi lokal (titik lewat jalur dalam pulau). */
  navNode: NormalizedPoint
  spawnPoint: NormalizedPoint
  workstationSlots: Array<{ id: string; x: number; y: number }>
  portalEntry: NormalizedPoint
  portalExit: NormalizedPoint
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Normalisasi kanvas → unit dunia (dibulatkan 0,1 unit agar deterministik SSR). */
export function toWorld(box: Box, point: NormalizedPoint): { x: number; y: number } {
  return {
    x: Math.round((box.left + box.width * point.x) * 10) / 10,
    y: Math.round((box.top + box.height * point.y) * 10) / 10,
  }
}

/** Titik di dalam poligon (ray casting). */
export function insidePolygon(point: NormalizedPoint, polygon: readonly NormalizedPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

/** Rata-rata simpul poligon (cukup untuk poligon cembung kecil). */
export function polygonCenter(polygon: readonly NormalizedPoint[]): NormalizedPoint {
  const sum = polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / polygon.length, y: sum.y / polygon.length }
}
