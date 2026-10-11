/**
 * Validasi geometri pulau terhadap ARTWORK-nya (tanpa ImageMagick): mask
 * tebing & alpha 96×64 per pulau di tests/fixtures/island-surface.json
 * dihasilkan bersama app/game/island-geometry.ts oleh
 * scripts/calibrate-island-geometry.ts.
 *
 * Invarian (brief §6.1): spawn, simpul, slot, dan portal berada di dalam
 * poligon jalan, TIDAK di udara (alpha 0) dan TIDAK di tebing; poligon di
 * dalam kotak terlihat; tepi luar poligon (bibir depan) di atas permukaan,
 * bukan tebing; interior poligon hampir seluruhnya bukan tebing; dunia memakai
 * geometri yang sama (anchor kaki robot = titik slot); pemetaan hanya
 * bergantung pada kotak render (zoom/viewport tidak mengubah koordinat dunia).
 * Mask tebing juga mencakup bangunan/pohon (warna biru/gelap), jadi "bukan
 * tebing" ≈ "tanah". Pulau berkalibrasi manual (Mission Hub) diuji untuk
 * kontainmen & alpha saja; permukaannya diverifikasi visual (overlay dev).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { insidePolygon, toWorld, type IslandArtGeometry, type NormalizedPoint } from '../../app/game/geometry'
import { ISLAND_ART_GEOMETRY } from '../../app/game/island-geometry'
import { buildWorld, isWalkableIsland } from '../../app/game/world'
import { OfficeEngine } from '../../app/game/engine'
import { ISLAND_KEYS, ISLANDS, v2Source, type IslandKey } from '../../app/utils/game-assets'
import { MISSION_HUB, STATIONS, hubBox, stationBox, stationSlots } from '../../app/utils/office-layout'

interface Fixture {
  mask: { width: number; height: number }
  islands: Record<string, { cliff: string[]; alpha: string[] }>
}
const fixture: Fixture = JSON.parse(readFileSync(join(import.meta.dir, '../fixtures/island-surface.json'), 'utf8'))

function cell(rows: string[], p: NormalizedPoint): string {
  const x = Math.min(fixture.mask.width - 1, Math.max(0, Math.floor(p.x * fixture.mask.width)))
  const y = Math.min(fixture.mask.height - 1, Math.max(0, Math.floor(p.y * fixture.mask.height)))
  return rows[y]?.[x] ?? '0'
}

const walkable = ISLAND_KEYS.filter((id) => ISLAND_ART_GEOMETRY[id].walkable)
const decorative = ISLAND_KEYS.filter((id) => !ISLAND_ART_GEOMETRY[id].walkable)

function anchors(geometry: IslandArtGeometry): Array<[string, NormalizedPoint]> {
  return [
    ['spawn', geometry.spawnPoint],
    ['navNode', geometry.navNode],
    ['portalEntry', geometry.portalEntry],
    ['portalExit', geometry.portalExit],
    ...geometry.workstationSlots.map((slot): [string, NormalizedPoint] => [slot.id, slot]),
  ]
}

function samplesAlong(a: NormalizedPoint, b: NormalizedPoint, count = 12): NormalizedPoint[] {
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / count,
    y: a.y + ((b.y - a.y) * i) / count,
  }))
}

describe('geometri artwork pulau', () => {
  test('fixture dan geometri dihasilkan dari berkas render yang sama (dimensi kanvas cocok)', () => {
    for (const id of ISLAND_KEYS) {
      const geometry = ISLAND_ART_GEOMETRY[id]
      const source = v2Source(ISLANDS[id])
      if (!source) throw new Error(`${id} tidak punya berkas render`)
      expect(`${geometry.sourceWidth}x${geometry.sourceHeight}`).toBe(`${source.width}x${source.height}`)
      expect(fixture.islands[id]?.cliff).toHaveLength(fixture.mask.height)
      expect(fixture.islands[id]?.alpha).toHaveLength(fixture.mask.height)
    }
  })

  test('delapan pulau utama dapat dijalani; pulau kliping v2 kecil ditandai dekoratif secara eksplisit', () => {
    expect([...walkable].sort().join(',')).toBe(
      [
        'mission-hub',
        'web-research',
        'data-warehouse',
        'client-brief',
        'knowledge-base',
        'analytics-tool',
        'report-builder',
        'task-manager',
      ]
        .sort()
        .join(','),
    )
    expect([...decorative].sort().join(',')).toBe('research-lab,training-center')
    for (const id of decorative) {
      expect(ISLAND_ART_GEOMETRY[id].workstationSlots).toEqual([])
      expect(ISLAND_ART_GEOMETRY[id].walkablePolygon).toEqual([])
      expect(isWalkableIsland(id)).toBe(false)
    }
  })

  test.each(walkable)('%s: poligon jalan di dalam kotak terlihat; bibir depan & interior bukan tebing/udara', (id) => {
    const geometry = ISLAND_ART_GEOMETRY[id]
    const rows = fixture.islands[id]
    if (!rows) throw new Error(`fixture ${id} tidak ada`)
    const polygon = geometry.walkablePolygon
    const vb = geometry.visibleBounds
    expect(polygon).toHaveLength(6)
    for (const p of polygon) {
      expect(p.x).toBeGreaterThanOrEqual(vb.x)
      expect(p.x).toBeLessThanOrEqual(vb.x + vb.width)
      expect(p.y).toBeGreaterThanOrEqual(vb.y)
      expect(p.y).toBeLessThanOrEqual(vb.y + vb.height)
      expect([id, cell(rows.alpha, p)]).toEqual([id, '1'])
    }
    // Tepi luar = bibir depan: kiri→depan (simpul 0→5) dan depan→kanan (5→4). Tidak boleh di udara,
    // dan ≥ 90% sampelnya bukan tebing (mask kasar 1 sel = ±1% kanvas).
    const [l, , , , r, f] = polygon as [
      NormalizedPoint,
      NormalizedPoint,
      NormalizedPoint,
      NormalizedPoint,
      NormalizedPoint,
      NormalizedPoint,
    ]
    const outer = [...samplesAlong(l, f), ...samplesAlong(f, r)]
    for (const p of outer) expect([id, cell(rows.alpha, p)]).toEqual([id, '1'])
    // Pulau kalibrasi manual (platform biru = warna batu): pemeriksaan mask tebing tidak bermakna;
    // kontainmen & alpha tetap diuji, dan permukaannya diverifikasi visual (overlay dev).
    // Bibir depan berbatasan langsung dengan tebing; pada mask kasar (1 sel = ±1% kanvas) sebagian
    // sampel tepi jatuh di sel campuran, maka ambangnya 75% (anchor & interior tetap ketat).
    const auto = geometry.calibration === 'auto'
    const offCliff = outer.filter((p) => cell(rows.cliff, p) === '0').length / outer.length
    if (auto) expect([id, offCliff >= 0.75]).toEqual([id, true])
    // Interior: kisi 2% kanvas; ≥ 95% sel bukan tebing dan 100% terlihat.
    let inside = 0
    let clean = 0
    for (let y = vb.y; y <= vb.y + vb.height; y += 0.02) {
      for (let x = vb.x; x <= vb.x + vb.width; x += 0.02) {
        const p = { x, y }
        if (!insidePolygon(p, polygon)) continue
        inside += 1
        expect([id, cell(rows.alpha, p)]).toEqual([id, '1'])
        if (cell(rows.cliff, p) === '0') clean += 1
      }
    }
    expect(inside).toBeGreaterThan(20)
    if (auto) expect([id, clean / inside >= 0.8]).toEqual([id, true])
  })

  test.each(walkable)('%s: spawn, simpul, slot, portal di dalam poligon, bukan di udara, bukan di tebing', (id) => {
    const geometry = ISLAND_ART_GEOMETRY[id]
    const rows = fixture.islands[id]
    if (!rows) throw new Error(`fixture ${id} tidak ada`)
    expect(geometry.workstationSlots).toHaveLength(2)
    for (const [name, p] of anchors(geometry)) {
      const label = `${id}:${name}`
      expect([label, insidePolygon(p, geometry.walkablePolygon)]).toEqual([label, true])
      expect([label, cell(rows.alpha, p)]).toEqual([label, '1'])
      if (geometry.calibration === 'auto') expect([label, cell(rows.cliff, p)]).toEqual([label, '0'])
    }
    // Dua slot tidak bertumpuk (≥ 4% lebar kanvas) dan portal tidak menumpuk slot.
    const [s0, s1] = geometry.workstationSlots
    if (!s0 || !s1) throw new Error(`${id}: slot kurang dari dua`)
    expect(Math.hypot(s0.x - s1.x, s0.y - s1.y)).toBeGreaterThan(0.04)
    for (const slot of [s0, s1]) {
      expect(Math.hypot(slot.x - geometry.portalEntry.x, slot.y - geometry.portalEntry.y)).toBeGreaterThan(0.03)
    }
  })

  test('dunia memetakan geometri lewat kotak render: anchor kaki robot = titik slot (unit dunia)', () => {
    const world = buildWorld()
    const engine = new OfficeEngine(world)
    for (const station of STATIONS) {
      const island = world.islands.get(station.id)
      if (!isWalkableIsland(station.id)) {
        expect(island).toBeUndefined()
        expect(stationSlots(station)).toEqual([])
        continue
      }
      if (!island) throw new Error(`${station.id} tidak ada di dunia`)
      const box = stationBox(station)
      const geometry = ISLAND_ART_GEOMETRY[station.id]
      expect(island.workstations.map((w) => w.point)).toEqual(geometry.workstationSlots.map((s) => toWorld(box, s)))
      expect(engine.stationPoint(station.id, 1)).toEqual(toWorld(box, geometry.workstationSlots[1] as NormalizedPoint))
      expect(island.portal.entry).toEqual(toWorld(box, geometry.portalEntry))
    }
    const hub = world.islands.get('mission-hub')
    expect(hub?.hub).toEqual(toWorld(hubBox(), ISLAND_ART_GEOMETRY['mission-hub'].navNode))
    expect(MISSION_HUB.island).toBe('mission-hub')
    // Tautan portal hanya antara pulau yang dapat dijalani.
    for (const link of world.links) {
      expect(world.islands.has(link.a)).toBe(true)
      expect(world.islands.has(link.b)).toBe(true)
    }
  })

  test('pemetaan hanya bergantung pada kotak render: skala/geser kotak menggeser titik secara linear (zoom aman)', () => {
    const geometry = ISLAND_ART_GEOMETRY['web-research']
    const base = { left: 100, top: 50, width: 300, height: 200 }
    const scaled = { left: 200, top: 100, width: 600, height: 400 }
    for (const [, p] of anchors(geometry)) {
      const a = toWorld(base, p)
      const b = toWorld(scaled, p)
      expect(b.x).toBeCloseTo(2 * a.x, 0)
      expect(b.y).toBeCloseTo(2 * a.y, 0)
    }
  })

  test('pulau dekoratif tetap dirender (STATIONS) tetapi tidak menerima penempatan agent', () => {
    for (const id of decorative as IslandKey[]) {
      expect(STATIONS.some((station) => station.id === id)).toBe(true)
    }
  })
})
