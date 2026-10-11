import {
  MISSION_HUB,
  STATIONS,
  energyConnections,
  hubBox,
  stationBox,
  type StationId,
  type WorldBox,
} from '../utils/office-layout'
import { ISLAND_ART_GEOMETRY } from './island-geometry'
import { toWorld } from './geometry'

/*
 * Model dunia untuk navigasi (murni, deterministik). Entitas: World, Island,
 * Workstation, Portal, InteractionZone, PortalLink. Semua koordinat = unit
 * dunia 1672 × 941 yang sama dengan renderer.
 *
 * Geometri tiap pulau (area jalan, simpul, spawn, slot, portal) berasal dari
 * ARTWORK-nya (app/game/island-geometry.ts, dikalibrasi dari kanvas gambar)
 * dan dipetakan ke dunia lewat kotak render pulau — bukan fraksi kotak yang
 * ditebak. Pulau yang artwork-nya tidak punya permukaan jalan (`walkable:
 * false`) bersifat dekoratif: tidak masuk graf navigasi dan tanpa slot.
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
  /** Titik keberangkatan (robot berjalan ke sini lalu menghilang). */
  entry: Point
  /** Titik kedatangan (robot muncul di sini). Boleh sama dengan `entry`. */
  exit: Point
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
  /** Area jalan di permukaan atas (apron depan; dapat cekung — lihat `localPath`). */
  walkable: Point[]
  /** Simpul navigasi lokal di tengah pita depan; "melihat" seluruh area jalan. */
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

/** Pulau yang masuk graf navigasi (artwork-nya punya permukaan jalan terkalibrasi). */
export function isWalkableIsland(id: IslandId): boolean {
  return ISLAND_ART_GEOMETRY[id].walkable
}

function islandFromGeometry(id: IslandId, label: string, box: WorldBox): Island {
  const geometry = ISLAND_ART_GEOMETRY[id]
  return {
    id,
    label,
    box,
    walkable: geometry.walkablePolygon.map((p) => toWorld(box, p)),
    hub: toWorld(box, geometry.navNode),
    spawn: toWorld(box, geometry.spawnPoint),
    portal: { island: id, entry: toWorld(box, geometry.portalEntry), exit: toWorld(box, geometry.portalExit) },
    workstations: geometry.workstationSlots.map((slot, index) => ({
      island: id,
      slot: index,
      point: toWorld(box, slot),
    })),
    zone: { island: id, box },
  }
}

export function buildWorld(): World {
  const islands = new Map<IslandId, Island>()
  for (const station of STATIONS) {
    if (!isWalkableIsland(station.id)) continue
    islands.set(station.id, islandFromGeometry(station.id, station.label, stationBox(station)))
  }
  islands.set('mission-hub', islandFromGeometry('mission-hub', MISSION_HUB.label, hubBox()))
  // Tautan portal hanya antara pulau yang ada di graf (jalur energi ke pulau dekoratif tetap digambar).
  const links = energyConnections()
    .filter((connection) => islands.has(connection.from) && islands.has(connection.to))
    .map((connection) => ({
      key: connection.key,
      a: connection.from,
      b: connection.to,
      curve: connection.curve,
    }))
  return { islands, links }
}

export { insidePolygon } from './geometry'

/** Titik pada Bézier kuadratik (t ∈ [0,1]). */
export function bezierPoint(curve: PortalLink['curve'], t: number): Point {
  const u = 1 - t
  return {
    x: u * u * curve.start.x + 2 * u * t * curve.control.x + t * t * curve.end.x,
    y: u * u * curve.start.y + 2 * u * t * curve.control.y + t * t * curve.end.y,
  }
}
