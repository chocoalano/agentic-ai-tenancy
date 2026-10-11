/**
 * Membangun aset v2 (bun run assets:v2) dari file asli asset pack.
 *
 * 1. Aset statis → public/game-assets-v2/{id}.webp
 *    - kliping registry, buang bintik serpihan kecil,
 *    - dekontaminasi tepi: piksel berwarna latar navy lembar sumber
 *      dikurangi alpha-nya (halo),
 *    - karakter: perbaikan simetri untuk sisi yang terpotong tipis,
 *    - fx: latar gelap opak → alpha sungguhan (unpremultiply),
 *    - resampling Lanczos + penajaman RGB ringan + alpha anti-alias.
 * 2. Sprite sheet karakter → public/game-assets-v2/agents/{karakter}/sheet.webp
 *    + atlas.json mengikuti kontrak `app/game/animation-spec.ts`. Frame
 *    diturunkan secara prosedural dari sprite statis (kualitas prototipe).
 *
 * Tidak ada detail ilustrasi baru yang dibuat; file asli tidak diubah.
 * Membutuhkan ImageMagick 7 (`magick`) — alat pengembangan saja.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AGENT_ANCHOR,
  AGENT_ANIMATIONS,
  AGENT_BODY_HEIGHT,
  AGENT_FRAME,
  AGENT_SHEET,
  AGENT_SHEET_QUALITY,
  ANIMATION_ROWS,
  frameRecipe,
  type FrameRecipe,
} from '../app/game/animation-spec'
import { CHARACTER_KEYS, CHARACTERS, allRegisteredAssets, v2Source, type GameAsset } from '../app/utils/game-assets'
import {
  components,
  createRaster,
  luminance,
  readRaster,
  resample,
  sampleBilinear,
  writeRaster,
  type Raster,
} from './lib/raster'

const ROOT = join(import.meta.dir, '..')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7)

function publicFile(url: string): string {
  return join(ROOT, 'public', ...url.split('/').filter(Boolean))
}

/* ------------------------------------------------------------------ *
 * Operasi perbaikan
 * ------------------------------------------------------------------ */

/** Buang komponen opak yang sangat kecil (bintik sisa potongan). */
function removeSpecks(raster: Raster, ratio = 0.006): number {
  const { labels, sizes } = components(raster, 40)
  const largest = Math.max(0, ...sizes)
  const limit = Math.max(12, largest * ratio)
  let removed = 0
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? -1
    if (label >= 0 && (sizes[label] ?? 0) < limit) {
      raster.data[index * 4 + 3] = 0
      removed += 1
    }
  }
  return removed
}

/** Warna latar lembar sumber (navy) diperkirakan dari piksel tepi yang hampir transparan/gelap. */
const SHEET_BACKGROUND = [16, 26, 58] as const

/**
 * Dekontaminasi tepi: piksel dalam 2 px dari area transparan yang warnanya
 * dekat dengan navy latar lembar sumber dan gelap → alpha dikurangi sebanding
 * dengan kedekatan warna (halo terbuang, garis tepi ilustrasi dipertahankan).
 */
function decontaminateEdges(raster: Raster): number {
  const { width, height, data } = raster
  const nearTransparent = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) >= 40) continue
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const nx = x + ox
          const ny = y + oy
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) nearTransparent[ny * width + nx] = 1
        }
      }
    }
  }
  let changed = 0
  for (let index = 0; index < width * height; index += 1) {
    if (!nearTransparent[index]) continue
    const base = index * 4
    const alpha = data[base + 3] ?? 0
    if (alpha === 0) continue
    const r = data[base] ?? 0
    const g = data[base + 1] ?? 0
    const b = data[base + 2] ?? 0
    const distance =
      Math.abs(r - SHEET_BACKGROUND[0]) + Math.abs(g - SHEET_BACKGROUND[1]) + Math.abs(b - SHEET_BACKGROUND[2])
    if (distance < 70 && luminance(r, g, b) < 0.2) {
      data[base + 3] = Math.round(alpha * (distance / 70) ** 2)
      changed += 1
    }
  }
  return changed
}

/**
 * Perbaikan simetri (karakter menghadap depan, hampir simetris): bila sisi
 * kanan terpotong lebih rapat daripada sisi kiri terhadap sumbu badan,
 * kanvas diperlebar dan piksel yang hilang diisi cermin sisi kiri.
 */
function mirrorRepair(raster: Raster, axisX: number): Raster {
  const { width, height, data } = raster
  let left = width
  for (let x = 0; x < width && left === width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) >= 128) {
        left = x
        break
      }
    }
  }
  const symmetricRight = Math.ceil(2 * axisX - left)
  if (symmetricRight <= width - 1) return raster
  const extra = symmetricRight - (width - 1) + 1
  const output = createRaster(width + extra, height)
  for (let y = 0; y < height; y += 1) {
    output.data.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * output.width * 4)
    // Isi hanya bila tepi kanan asli opak pada baris ini (benar-benar terpotong).
    if ((data[(y * width + width - 1) * 4 + 3] ?? 0) < 128) continue
    for (let x = width; x < output.width; x += 1) {
      const mirrorX = Math.round(2 * axisX - x)
      if (mirrorX < 0 || mirrorX >= width) continue
      const from = (y * width + mirrorX) * 4
      const to = (y * output.width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) output.data[to + channel] = data[from + channel] ?? 0
    }
  }
  return output
}

/** FX: latar gelap opak → alpha (warna di-unpremultiply terhadap latar). */
function luminanceToAlpha(raster: Raster): void {
  const { width, height, data } = raster
  // Latar = warna persentil-10 luminans dari piksel opak (blok gelap di balik cahaya).
  const opaque: number[] = []
  for (let index = 0; index < width * height; index += 1) if ((data[index * 4 + 3] ?? 0) > 128) opaque.push(index * 4)
  opaque.sort(
    (a, b) =>
      luminance(data[a] ?? 0, data[a + 1] ?? 0, data[a + 2] ?? 0) -
      luminance(data[b] ?? 0, data[b + 1] ?? 0, data[b + 2] ?? 0),
  )
  const reference = opaque[Math.floor(opaque.length * 0.1)] ?? 0
  const background =
    opaque.length > 0
      ? [data[reference] ?? 0, data[reference + 1] ?? 0, data[reference + 2] ?? 0]
      : [...SHEET_BACKGROUND]
  // Unblend: C = bg·(1−a) + F·a → a = maks((C−bg)/(255−bg)), F = bg + (C−bg)/a (hue terjaga).
  for (let index = 0; index < width * height; index += 1) {
    const base = index * 4
    const original = (data[base + 3] ?? 0) / 255
    const diff = [0, 1, 2].map((channel) => (data[base + channel] ?? 0) - (background[channel] ?? 0))
    const alpha = Math.min(
      1,
      Math.max(...diff.map((value, channel) => Math.max(0, value) / Math.max(1, 255 - (background[channel] ?? 0)))),
    )
    if (alpha <= 0.04) {
      data[base + 3] = 0
      continue
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const value = (background[channel] ?? 0) + (diff[channel] ?? 0) / alpha
      data[base + channel] = Math.max(0, Math.min(255, Math.round(value)))
    }
    data[base + 3] = Math.round(alpha * original * 255)
  }
}

/* ------------------------------------------------------------------ *
 * Aset statis v2
 * ------------------------------------------------------------------ */

function repairedSource(item: GameAsset, options: { mirror?: boolean } = {}): Raster {
  const raster = readRaster(publicFile(item.src), { crop: item.crop })
  const category = item.id.split('/')[0]
  if (category === 'fx') {
    luminanceToAlpha(raster)
    // FX: serpihan objek tetangga berukuran sedang ikut dibuang (≥ 5% badan utama dipertahankan).
    removeSpecks(raster, 0.05)
    return raster
  }
  if (category === 'backgrounds') return raster
  removeSpecks(raster)
  decontaminateEdges(raster)
  if (options.mirror) return mirrorRepair(raster, (item.anchorX ?? 0.5) * raster.width)
  return raster
}

function buildStatic(item: GameAsset): string | null {
  const target = v2Source(item, false)
  if (!target) return null
  const source = repairedSource(item)
  const output = resample(source, target.width, target.height, { sharpen: !item.id.startsWith('backgrounds/') })
  const file = publicFile(target.src)
  mkdirSync(dirname(file), { recursive: true })
  const quality = item.id.startsWith('backgrounds/')
    ? ['-quality', '88']
    : ['-define', 'webp:lossless=true', '-define', 'webp:exact=true']
  writeRaster(output, file, quality)
  return target.src
}

/* ------------------------------------------------------------------ *
 * Sprite sheet karakter (frame prosedural)
 * ------------------------------------------------------------------ */

interface SpriteSource {
  raster: Raster
  /** Pivot kaki dalam koordinat sprite. */
  pivotX: number
  pivotY: number
  /** Garis potong atas area kaki (untuk animasi langkah). */
  legTop: number
}

function characterSprite(item: GameAsset, anchorX: number): SpriteSource {
  const repaired = repairedSource(item, { mirror: true })
  const scale = AGENT_BODY_HEIGHT / repaired.height
  const raster = resample(repaired, Math.round(repaired.width * scale), AGENT_BODY_HEIGHT)
  return {
    raster,
    pivotX: anchorX * (item.width - (item.crop?.left ?? 0) - (item.crop?.right ?? 0)) * scale,
    pivotY: raster.height - 2,
    legTop: raster.height * 0.86,
  }
}

function blend(canvas: Raster, x: number, y: number, rgba: [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || rgba[3] <= 0) return
  const index = (y * canvas.width + x) * 4
  const srcA = rgba[3] / 255
  const dstA = (canvas.data[index + 3] ?? 0) / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA <= 0) return
  for (let channel = 0; channel < 3; channel += 1) {
    const src = rgba[channel] ?? 0
    const dst = canvas.data[index + channel] ?? 0
    canvas.data[index + channel] = Math.round((src * srcA + dst * dstA * (1 - srcA)) / outA)
  }
  canvas.data[index + 3] = Math.round(outA * 255)
}

/**
 * Gambar sprite ke kanvas frame dengan transformasi affine berporos kaki.
 * `region` membatasi baris sumber (mis. hanya kaki); `offset` = geser khusus region.
 */
function drawSprite(
  canvas: Raster,
  originX: number,
  originY: number,
  sprite: SpriteSource,
  recipe: FrameRecipe,
  region: { y0: number; y1: number; x0: number; x1: number; offsetX: number; offsetY: number } | null,
  exclude: { y0: number; y1: number; x0: number; x1: number } | null = null,
) {
  const angle = (recipe.rotate * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const { raster } = sprite
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      // Invers transformasi: kanvas → koordinat sprite.
      let px = x - originX - recipe.dx - (region?.offsetX ?? 0)
      let py = y - originY - recipe.dy - (region?.offsetY ?? 0)
      const rx = cos * px + sin * py
      const ry = -sin * px + cos * py
      px = rx / recipe.scaleX + sprite.pivotX
      py = ry / recipe.scaleY + sprite.pivotY
      if (px < -1 || py < -1 || px > raster.width || py > raster.height) continue
      if (region && (py < region.y0 || py >= region.y1 || px < region.x0 || px >= region.x1)) continue
      if (exclude && py >= exclude.y0 && py < exclude.y1 && px >= exclude.x0 && px < exclude.x1) continue
      const sample = sampleBilinear(raster, px, py)
      if (sample[3] <= 0) continue
      if (recipe.tint) {
        const amount = recipe.tint.amount
        sample[0] = sample[0] * (1 - amount) + recipe.tint.r * amount
        sample[1] = sample[1] * (1 - amount) + recipe.tint.g * amount
        sample[2] = sample[2] * (1 - amount) + recipe.tint.b * amount
      }
      sample[3] *= recipe.alpha
      blend(canvas, x, y, sample)
    }
  }
}

function renderFrame(sprite: SpriteSource, recipe: FrameRecipe): Raster {
  const canvas = createRaster(AGENT_FRAME.width, AGENT_FRAME.height)
  if (recipe.legs) {
    const { raster, pivotX, legTop } = sprite
    // Inti telapak saja (tangan tidak ikut teriris). Kaki mengikuti transformasi
    // tubuh; hanya pengangkatan/ayunan yang berbeda — tubuh digambar dengan lubang
    // tepat di area telapak sehingga tidak ada sambungan yang terlihat.
    const half = raster.width * 0.3
    const feet = { y0: legTop, y1: raster.height, x0: pivotX - half, x1: pivotX + half }
    drawSprite(canvas, AGENT_ANCHOR.x, AGENT_ANCHOR.y, sprite, recipe, {
      ...feet,
      x1: pivotX,
      offsetX: recipe.legs.leftShift,
      offsetY: -recipe.legs.leftLift,
    })
    drawSprite(canvas, AGENT_ANCHOR.x, AGENT_ANCHOR.y, sprite, recipe, {
      ...feet,
      x0: pivotX,
      offsetX: recipe.legs.rightShift,
      offsetY: -recipe.legs.rightLift,
    })
    drawSprite(canvas, AGENT_ANCHOR.x, AGENT_ANCHOR.y, sprite, recipe, null, feet)
    return canvas
  }
  drawSprite(canvas, AGENT_ANCHOR.x, AGENT_ANCHOR.y, sprite, recipe, null)
  return canvas
}

function buildCharacterSheet(character: (typeof CHARACTER_KEYS)[number]): string {
  const item = CHARACTERS[character]
  const sprite = characterSprite(item, item.anchorX ?? 0.5)
  const sheet = createRaster(AGENT_SHEET.columns * AGENT_FRAME.width, AGENT_SHEET.rows * AGENT_FRAME.height)
  const animations: Record<string, unknown> = {}
  ANIMATION_ROWS.forEach((name, row) => {
    const definition = AGENT_ANIMATIONS[name]
    const frames: Array<{ x: number; y: number; w: number; h: number }> = []
    for (let frame = 0; frame < definition.frames; frame += 1) {
      const rendered = renderFrame(sprite, frameRecipe(name, frame))
      const x = frame * AGENT_FRAME.width
      const y = row * AGENT_FRAME.height
      for (let line = 0; line < AGENT_FRAME.height; line += 1) {
        sheet.data.set(
          rendered.data.subarray(line * AGENT_FRAME.width * 4, (line + 1) * AGENT_FRAME.width * 4),
          ((y + line) * sheet.width + x) * 4,
        )
      }
      frames.push({ x, y, w: AGENT_FRAME.width, h: AGENT_FRAME.height })
    }
    animations[name] = { ...definition, row, frameCount: definition.frames, frames }
  })
  const directory = join(ROOT, 'public', 'game-assets-v2', 'agents', character)
  mkdirSync(directory, { recursive: true })
  writeRaster(sheet, join(directory, 'sheet.webp'), ['-define', 'webp:alpha-quality=100', '-quality', '90'])
  const atlas = {
    version: 2,
    character,
    name: item.name,
    archetype: item.archetype,
    image: 'sheet.webp',
    quality: AGENT_SHEET_QUALITY,
    qualityNote:
      'Frame diturunkan secara prosedural dari satu sprite statis (characters/' +
      character +
      '.png, diperbaiki). Ganti dengan frame artist dengan kontrak yang sama.',
    sheet: { width: sheet.width, height: sheet.height, columns: AGENT_SHEET.columns, rows: AGENT_SHEET.rows },
    frame: AGENT_FRAME,
    anchor: AGENT_ANCHOR,
    animations,
  }
  writeFileSync(join(directory, 'atlas.json'), `${JSON.stringify(atlas, null, 2)}\n`)
  return `/game-assets-v2/agents/${character}/sheet.webp`
}

/* ------------------------------------------------------------------ */

let built = 0
for (const item of allRegisteredAssets()) {
  if (only && !item.id.startsWith(only)) continue
  const output = buildStatic(item)
  if (output) {
    built += 1
    console.log(`✓ ${output}`)
  }
}
if (!only || only === 'agents') {
  for (const character of CHARACTER_KEYS) {
    console.log(`✓ ${buildCharacterSheet(character)} (+ atlas.json)`)
    built += 1
  }
}
console.log(`\n${built} aset v2 dibuat.`)
