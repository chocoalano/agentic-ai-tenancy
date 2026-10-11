import type { IslandId, Point, PortalLink, World } from './world'

/*
 * Navigasi: graf pulau (simpul) + tautan portal (sisi, mengikuti jaringan
 * energi). Rute = urutan leg:
 *   walk     — berjalan di atas SATU pulau (langsung, atau lewat simpul tengah bila searah),
 *   teleport — masuk portal pulau A, transit sepanjang jalur energi, keluar di
 *              portal pulau B.
 * Robot tidak pernah berjalan melintasi udara kosong.
 */

export interface WalkLeg {
  kind: 'walk'
  island: IslandId
  points: Point[]
}

export interface TeleportLeg {
  kind: 'teleport'
  from: IslandId
  to: IslandId
  link: PortalLink
  /** true bila kurva link harus ditempuh dari ujung ke pangkal. */
  reversed: boolean
}

export type RouteLeg = WalkLeg | TeleportLeg

export interface Location {
  island: IslandId
  point: Point
}

/** Biaya teleport relatif terhadap jarak jalan (unit dunia). */
const TELEPORT_COST = 400

function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
}

/** Simpul tengah dilewati hanya bila searah (memutar ≤ 25%); selain itu langsung. */
const HUB_DETOUR_LIMIT = 1.25

/**
 * Jalur lokal di satu pulau. Area jalan berupa poligon cembung, sehingga ruas
 * lurus antara dua titik di dalamnya tetap di atas pulau. Simpul tengah dipakai
 * sebagai titik lewat bila hampir searah, agar robot tidak bolak-balik.
 */
export function localPath(world: World, island: IslandId, from: Point, to: Point): Point[] {
  const hub = world.islands.get(island)?.hub
  const points = [from]
  const viaHub =
    hub !== undefined &&
    !samePoint(from, hub) &&
    !samePoint(to, hub) &&
    distance(from, hub) + distance(hub, to) <= distance(from, to) * HUB_DETOUR_LIMIT
  if (hub && viaHub) points.push(hub)
  if (!samePoint(points[points.length - 1] ?? from, to)) points.push(to)
  return points
}

/** Dijkstra di atas graf pulau; mengembalikan urutan tautan yang dilalui. */
export function islandPath(world: World, from: IslandId, to: IslandId): Array<{ link: PortalLink; reversed: boolean }> {
  if (from === to) return []
  const best = new Map<IslandId, number>([[from, 0]])
  const previous = new Map<IslandId, { island: IslandId; link: PortalLink; reversed: boolean }>()
  const open = new Set<IslandId>([from])
  while (open.size > 0) {
    let current: IslandId | undefined
    for (const candidate of open) {
      if (current === undefined || (best.get(candidate) ?? Infinity) < (best.get(current) ?? Infinity))
        current = candidate
    }
    if (current === undefined) break
    open.delete(current)
    if (current === to) break
    for (const link of world.links) {
      const forward = link.a === current
      const backward = link.b === current
      if (!forward && !backward) continue
      const next = forward ? link.b : link.a
      const a = world.islands.get(current)?.portal.point
      const b = world.islands.get(next)?.portal.point
      const cost = (best.get(current) ?? 0) + TELEPORT_COST + (a && b ? distance(a, b) * 0.2 : 0)
      if (cost < (best.get(next) ?? Infinity)) {
        best.set(next, cost)
        previous.set(next, { island: current, link, reversed: backward })
        open.add(next)
      }
    }
  }
  const hops: Array<{ link: PortalLink; reversed: boolean }> = []
  let cursor: IslandId = to
  while (cursor !== from) {
    const step = previous.get(cursor)
    if (!step) return []
    hops.unshift({ link: step.link, reversed: step.reversed })
    cursor = step.island
  }
  return hops
}

/** Rute lengkap dari lokasi saat ini ke tujuan. Kosong bila tidak terjangkau. */
export function findRoute(world: World, from: Location, to: Location): RouteLeg[] {
  if (from.island === to.island) {
    const points = localPath(world, from.island, from.point, to.point)
    return points.length > 1 ? [{ kind: 'walk', island: from.island, points }] : []
  }
  const hops = islandPath(world, from.island, to.island)
  if (hops.length === 0) return []
  const legs: RouteLeg[] = []
  const startPortal = world.islands.get(from.island)?.portal.point
  const endPortal = world.islands.get(to.island)?.portal.point
  if (!startPortal || !endPortal) return []
  const toPortal = localPath(world, from.island, from.point, startPortal)
  if (toPortal.length > 1) legs.push({ kind: 'walk', island: from.island, points: toPortal })
  let island = from.island
  for (const hop of hops) {
    const next = hop.reversed ? hop.link.a : hop.link.b
    // Pulau perantara memakai pad portal yang sama untuk masuk & keluar — tidak perlu berjalan.
    legs.push({ kind: 'teleport', from: island, to: next, link: hop.link, reversed: hop.reversed })
    island = next
  }
  const fromPortal = localPath(world, to.island, endPortal, to.point)
  if (fromPortal.length > 1) legs.push({ kind: 'walk', island: to.island, points: fromPortal })
  return legs
}
