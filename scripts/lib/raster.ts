/**
 * Utilitas raster RGBA untuk skrip aset (audit, perbaikan v2, sprite sheet).
 *
 * Decode/encode memakai ImageMagick 7 (`magick`) — alat pengembangan saja;
 * operasi piksel dilakukan di TypeScript agar dapat diperiksa dan diuji.
 */

export interface Raster {
  width: number
  height: number
  /** RGBA 8-bit, baris demi baris. */
  data: Uint8ClampedArray
}

export interface Crop {
  top: number
  right: number
  bottom: number
  left: number
}

function run(args: string[], input?: Uint8Array): Uint8Array {
  const result = Bun.spawnSync(['magick', ...args], { stdin: input, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`magick ${args.join(' ')}: ${result.stderr.toString().trim()}`)
  return result.stdout
}

/** Membaca gambar (opsional kliping + resize Lanczos) menjadi RGBA. */
export function readRaster(
  file: string,
  options: { crop?: Crop; resize?: { width: number; height: number } } = {},
): Raster {
  const size = run(['identify', '-format', '%w %h', file]).toString().trim().split(' ').map(Number)
  let width = size[0] ?? 0
  let height = size[1] ?? 0
  const args = [file, '-alpha', 'on']
  if (options.crop) {
    const { top, right, bottom, left } = options.crop
    width -= left + right
    height -= top + bottom
    args.push('-crop', `${width}x${height}+${left}+${top}`, '+repage')
  }
  if (options.resize) {
    width = options.resize.width
    height = options.resize.height
    args.push('-filter', 'Lanczos', '-resize', `${width}x${height}!`)
  }
  args.push('-depth', '8', 'rgba:-')
  const bytes = run(args)
  if (bytes.length !== width * height * 4) throw new Error(`Ukuran raster tidak cocok untuk ${file}`)
  return { width, height, data: new Uint8ClampedArray(bytes) }
}

/** Menulis RGBA ke file (format dari ekstensi: .png/.webp). */
export function writeRaster(raster: Raster, file: string, extra: string[] = []): void {
  run(
    ['-size', `${raster.width}x${raster.height}`, '-depth', '8', 'rgba:-', ...extra, '-strip', file],
    new Uint8Array(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength),
  )
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Label komponen terhubung (4-arah) piksel dengan alpha ≥ threshold. */
export function components(raster: Raster, threshold = 128): { labels: Int32Array; sizes: number[] } {
  const { width, height, data } = raster
  const labels = new Int32Array(width * height).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1 || (data[start * 4 + 3] ?? 0) < threshold) continue
    const label = sizes.length
    let size = 0
    labels[start] = label
    stack.push(start)
    while (stack.length > 0) {
      const index = stack.pop() ?? 0
      size += 1
      const x = index % width
      const y = Math.floor(index / width)
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (labels[next] !== -1 || (data[next * 4 + 3] ?? 0) < threshold) continue
        labels[next] = label
        stack.push(next)
      }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

/** Piksel tepi: opak dengan setidaknya satu tetangga transparan / batas gambar. */
export function isEdgePixel(raster: Raster, x: number, y: number, threshold = 128): boolean {
  const { width, height, data } = raster
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true
    if ((data[(ny * width + nx) * 4 + 3] ?? 0) < threshold) return true
  }
  return false
}

/**
 * Resample Lanczos ke ukuran target + penajaman RGB ringan + alpha anti-alias
 * (blur kecil lalu dikencangkan) — dilakukan oleh ImageMagick.
 */
export function resample(raster: Raster, width: number, height: number, options: { sharpen?: boolean } = {}): Raster {
  const args = [
    '-size',
    `${raster.width}x${raster.height}`,
    '-depth',
    '8',
    'rgba:-',
    '-filter',
    'Lanczos',
    '-resize',
    `${width}x${height}!`,
  ]
  if (options.sharpen !== false) args.push('-channel', 'RGB', '-unsharp', '0x1.1+0.7+0.01', '+channel')
  args.push('-channel', 'A', '-blur', '0x0.7', '-level', '12%,88%', '+channel', '-depth', '8', 'rgba:-')
  const bytes = run(args, new Uint8Array(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength))
  if (bytes.length !== width * height * 4) throw new Error('Ukuran hasil resample tidak cocok')
  return { width, height, data: new Uint8ClampedArray(bytes) }
}

/** Sampel bilinear dengan alpha terpremultiplikasi (tanpa halo warna saat transformasi). */
export function sampleBilinear(raster: Raster, x: number, y: number): [number, number, number, number] {
  const { width, height, data } = raster
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  for (const [ox, oy, weight] of [
    [0, 0, (1 - fx) * (1 - fy)],
    [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy],
    [1, 1, fx * fy],
  ] as const) {
    const px = x0 + ox
    const py = y0 + oy
    if (px < 0 || py < 0 || px >= width || py >= height || weight === 0) continue
    const index = (py * width + px) * 4
    const alpha = ((data[index + 3] ?? 0) / 255) * weight
    r += (data[index] ?? 0) * alpha
    g += (data[index + 1] ?? 0) * alpha
    b += (data[index + 2] ?? 0) * alpha
    a += alpha
  }
  if (a <= 0) return [0, 0, 0, 0]
  return [r / a, g / a, b / a, a * 255]
}
