/**
 * Audit kualitas aset game (bun run assets:audit [--v2] [--json]).
 *
 * Mengukur setiap aset dari registry SETELAH kliping:
 * - softAlpha  : % piksel tampak dengan alpha parsial (0 = alpha biner/bergerigi)
 * - darkEdge   : % piksel tepi yang warnanya dekat navy latar lembar sumber
 *                (halo sisa potongan; garis tepi kartun hitam tidak dihitung)
 * - fragments  : jumlah komponen terpisah selain badan utama (≥ 6 px)
 * - clipped    : sisi dengan potongan lurus (deretan opak kontinu ≥ max(8 px, 12% sisi))
 * - bakedBg    : % piksel opak gelap (latar ikut opak, relevan untuk fx)
 * lalu mengklasifikasikan aset. `--v2` mengaudit hasil perbaikan di
 * public/game-assets-v2 untuk perbandingan.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { allRegisteredAssets, v2Source, visibleSize, type GameAsset } from '../app/utils/game-assets'
import { components, isEdgePixel, luminance, readRaster, type Raster } from './lib/raster'

const ROOT = join(import.meta.dir, '..')
const useV2 = process.argv.includes('--v2')
const asJson = process.argv.includes('--json')

export interface AssetMetrics {
  id: string
  width: number
  height: number
  softAlpha: number
  darkEdge: number
  fragments: number
  clipped: string[]
  bakedBg: number
}

function publicFile(url: string): string {
  return join(ROOT, 'public', ...url.split('/').filter(Boolean))
}

export function measure(id: string, raster: Raster): AssetMetrics {
  const { width, height, data } = raster
  let visible = 0
  let soft = 0
  let edges = 0
  let darkEdges = 0
  let opaque = 0
  let darkOpaque = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3] ?? 0
      if (alpha === 0) continue
      visible += 1
      if (alpha < 250) soft += 1
      if (alpha < 128) continue
      opaque += 1
      const light = luminance(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0)
      if (light < 0.2) darkOpaque += 1
      if (isEdgePixel(raster, x, y)) {
        edges += 1
        const r = data[index] ?? 0
        const g = data[index + 1] ?? 0
        const b = data[index + 2] ?? 0
        if (Math.abs(r - 16) + Math.abs(g - 26) + Math.abs(b - 58) < 45) darkEdges += 1
      }
    }
  }
  const { sizes } = components(raster)
  const largest = Math.max(0, ...sizes)
  const fragments = sizes.filter((size) => size >= 6 && size !== largest).length
  // Terpotong = deretan opak KONTINU panjang di satu sisi (potongan lurus), bukan
  // sekadar menyentuh batas (potongan otomatis selalu rapat ke objek).
  const clipped: string[] = []
  const longestRun = (fn: (i: number) => number, length: number) => {
    let best = 0
    let run = 0
    for (let i = 0; i < length; i += 1) {
      run = (data[fn(i) * 4 + 3] ?? 0) >= 128 ? run + 1 : 0
      best = Math.max(best, run)
    }
    return best
  }
  const flat = (run: number, length: number) => run >= Math.max(8, length * 0.12)
  if (
    flat(
      longestRun((i) => i, width),
      width,
    )
  )
    clipped.push('atas')
  if (
    flat(
      longestRun((i) => (height - 1) * width + i, width),
      width,
    )
  )
    clipped.push('bawah')
  if (
    flat(
      longestRun((i) => i * width, height),
      height,
    )
  )
    clipped.push('kiri')
  if (
    flat(
      longestRun((i) => i * width + width - 1, height),
      height,
    )
  )
    clipped.push('kanan')
  const percent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 1000) / 10)
  return {
    id,
    width,
    height,
    softAlpha: percent(soft, visible),
    darkEdge: percent(darkEdges, edges),
    fragments,
    clipped,
    bakedBg: percent(darkOpaque, opaque),
  }
}

export type Verdict = 'layak' | 'dapat diperbaiki' | 'perlu dibuat ulang' | 'terblokir' | 'referensi saja'

/** Klasifikasi untuk pemakaian produksi (bukan prototipe). */
export function classify(asset: GameAsset, metrics: AssetMetrics): { verdict: Verdict; reason: string } {
  const category = asset.id.split('/')[0]
  const lowRes = Math.min(metrics.width, metrics.height) < 160
  if (category === 'ui-previews') return { verdict: 'referensi saja', reason: 'Teks tercetak; hanya acuan gaya' }
  if (category === 'fx') {
    return metrics.bakedBg > 25
      ? { verdict: 'dapat diperbaiki', reason: 'Latar gelap opak → konversi luminans ke alpha' }
      : { verdict: 'layak', reason: 'Alpha memadai' }
  }
  if (category === 'backgrounds') {
    return {
      verdict: 'terblokir',
      reason: 'Resolusi 265×105 setelah kliping; perlu render ulang ≥ 1920 px (tanpa sumber/alat generasi)',
    }
  }
  if (category === 'characters') {
    return {
      verdict: 'terblokir',
      reason: 'Statis 1 pose, resolusi rendah; frame animasi butuh render ulang dari artwork sumber (tidak tersedia)',
    }
  }
  if (metrics.clipped.length > 0 && category !== 'icons') {
    return {
      verdict: 'perlu dibuat ulang',
      reason: `Garis tepi terpotong (${metrics.clipped.join(', ')}) — tidak dapat dipulihkan dengan pengolahan citra`,
    }
  }
  if (category === 'icons') {
    return asset.crop
      ? { verdict: 'dapat diperbaiki', reason: 'Ubin utuh setelah kliping' }
      : { verdict: 'perlu dibuat ulang', reason: 'Ubin ikon terpotong + sisa label' }
  }
  if (metrics.fragments > 0 || metrics.softAlpha < 5 || metrics.darkEdge > 25) {
    return {
      verdict: lowRes ? 'dapat diperbaiki' : 'dapat diperbaiki',
      reason: `Alpha biner/halo/serpihan → perbaikan v2${lowRes ? '; resolusi tetap konsep' : ''}`,
    }
  }
  return { verdict: 'layak', reason: 'Tidak ada cacat terukur' }
}

const rows: Array<AssetMetrics & { verdict: Verdict; reason: string; source: string }> = []
for (const asset of allRegisteredAssets()) {
  const v2 = v2Source(asset)
  if (useV2 && !v2) continue
  const file = useV2 && v2 ? publicFile(v2.src) : publicFile(asset.src)
  if (!existsSync(file)) {
    console.error(`✖ ${file} tidak ada`)
    process.exitCode = 1
    continue
  }
  const raster = useV2 ? readRaster(file) : readRaster(file, { crop: asset.crop })
  const metrics = measure(asset.id, raster)
  const { verdict, reason } = classify(asset, metrics)
  rows.push({ ...metrics, verdict, reason, source: useV2 ? 'v2' : 'asli' })
  void visibleSize
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log('| Aset | Ukuran | Alpha lembut | Tepi gelap | Serpihan | Terpotong | Latar opak | Status | Alasan |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of rows) {
    console.log(
      `| \`${row.id}\` | ${row.width}×${row.height} | ${row.softAlpha}% | ${row.darkEdge}% | ${row.fragments} | ${row.clipped.join(', ') || '—'} | ${row.bakedBg}% | ${useV2 ? '—' : row.verdict} | ${useV2 ? '' : row.reason} |`,
    )
  }
  const tally = rows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row.verdict]: (acc[row.verdict] ?? 0) + 1 }),
    {},
  )
  if (!useV2)
    console.log(
      `\nRingkasan: ${Object.entries(tally)
        .map(([key, value]) => `${key} ${value}`)
        .join(' · ')}`,
    )
}
