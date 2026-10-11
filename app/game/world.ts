import {
  MISSION_HUB,
  STATIONS,
  energyConnections,
  hubBox,
  stationBox,
  type StationId,
  type WorldBox,
} from '../utils/office-layout'

/*
 * Model dunia untuk navigasi (murni, deterministik). Entitas: World, Island,
 * Workstation, Portal, InteractionZone, PortalLink. Semua koordinat = unit
 * dunia 1672 × 941 yang sama dengan renderer.
 *
 * Pulau melayang di langit: robot hanya berjalan DI ATAS area jalan pulau;
 * perpindahan antar pulau selalu lewat portal (lihat navigation.ts).
 */

export type IslandId = StationId | 'mission-hub'

export interface Point {
  x: number
  y: number
}

export interface Workstation {
  island: IslandId
  slot: number
  /** Titik kaki robot saat bekerja. */
  point: Point
}

export interface Portal {
  island: IslandId
  /** Titik masuk/keluar portal (satu pad per pulau). */
  point: Point
}

export interface InteractionZone {
  island: IslandId
  /** Kotak klik pulau (unit dunia). */
  box: WorldBox
}

export interface Island {
  id: IslandId
  label: string
  box: WorldBox
  /** Poligon area jalan (belah ketupat di permukaan platform depan). */
  walkable: Point[]
  /** Simpul jalan di tengah depan platform — titik lewat bila searah (lihat `localPath`). */
  hub: Point
  spawn: Point
  portal: Portal
  workstations: Workstation[]
  zone: InteractionZone
}

export interface PortalLink {
  key: string
  a: IslandId
  b: IslandId
  /** Geometri jalur energi (orb transit mengikuti kurva ini). */
  curve: { start: Point; control: Point; end: Point }
}

export interface World {
  islands: ReadonlyMap<IslandId, Island>
  links: readonly PortalLink[]
}

function at(box: WorldBox, fx: number, fy: number): Point {
  return { x: Math.round((box.left + box.width * fx) * 10) / 10, y: Math.round((box.top + box.height * fy) * 10) / 10 }
}

function stationIsland(id: StationId, label: string, box: WorldBox, slots: ReadonlyArray<Point>): Island {
  return {
    id,
    label,
    box,
    walkable: [at(box, 0.12, 0.66), at(box, 0.5, 0.5), at(box, 0.9, 0.66), at(box, 0.5, 0.86)],
    hub: at(box, 0.5, 0.72),
    spawn: at(box, 0.5, 0.68),
    portal: { island: id, point: at(box, 0.26, 0.71) },
    workstations: slots.map((point, slot) => ({ island: id, slot, point })),
    zone: { island: id, box },
  }
}

export function buildWorld(): World {
  const islands = new Map<IslandId, Island>()
  for (const station of STATIONS) {
    const box = stationBox(station)
    islands.set(
      station.id,
      stationIsland(
        station.id,
        station.label,
        box,
        station.slots.map((slot) => at(box, slot.x, slot.y)),
      ),
    )
  }
  const hub = hubBox()
  islands.set('mission-hub', {
    id: 'mission-hub',
    label: MISSION_HUB.label,
    box: hub,
    walkable: [at(hub, 0.2, 0.7), at(hub, 0.5, 0.6), at(hub, 0.8, 0.7), at(hub, 0.5, 0.86)],
    hub: at(hub, 0.5, 0.76),
    spawn: at(hub, 0.5, 0.74),
    portal: { island: 'mission-hub', point: at(hub, 0.3, 0.74) },
    workstations: [
      { island: 'mission-hub', slot: 0, point: at(hub, 0.4, 0.72) },
      { island: 'mission-hub', slot: 1, point: at(hub, 0.62, 0.74) },
    ],
    zone: { island: 'mission-hub', box: hub },
  })
  const links = energyConnections().map((connection) => ({
    key: connection.key,
    a: connection.from,
    b: connection.to,
    curve: connection.curve,
  }))
  return { islands, links }
}

/** Titik di dalam poligon (ray casting). */
export function insidePolygon(point: Point, polygon: readonly Point[]): boolean {
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

/** Titik pada Bézier kuadratik (t ∈ [0,1]). */
export function bezierPoint(curve: PortalLink['curve'], t: number): Point {
  const u = 1 - t
  return {
    x: u * u * curve.start.x + 2 * u * t * curve.control.x + t * t * curve.end.x,
    y: u * u * curve.start.y + 2 * u * t * curve.control.y + t * t * curve.end.y,
  }
}
