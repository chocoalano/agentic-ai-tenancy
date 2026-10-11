import { describe, expect, test } from 'bun:test'
import type { AgentLifecycleStatus } from '../../domains/agents/types'
import { CHARACTER_KEYS, ISLANDS, allRegisteredAssets, v2Source, visibleSize } from '../../app/utils/game-assets'
import {
  MISSION_HUB,
  OFFICE_WORLD,
  STATIONS,
  buildOfficeScene,
  characterForAgent,
  energyConnections,
  hubBox,
  stationBox,
  type SceneAgentInput,
  stationSlots,
} from '../../app/utils/office-layout'
import { deriveSetupMission } from '../../app/utils/office-mission'
import { PREVIEW_MISSION, previewActors, previewRoster, stationStatesFor } from '../../app/utils/office-preview'

let sequence = 0
function agent(
  roleKey: string,
  overrides: Partial<SceneAgentInput> & { lifecycleStatus?: AgentLifecycleStatus } = {},
): SceneAgentInput {
  sequence += 1
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    name: `Agent ${sequence}`,
    roleKey,
    roleTitle: roleKey.replace(/-/g, ' '),
    lifecycleStatus: 'active',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, sequence)),
    ...overrides,
  }
}

describe('registry aset game', () => {
  test('tujuan builder prosedural tidak menimpa ilustrasi rekonstruksi', () => {
    const island = ISLANDS['web-research']
    const display = v2Source(island)
    const buildTarget = v2Source(island, false)
    expect(display?.src).toBe('/game-assets-v2/islands/web-research-v3.webp')
    expect(buildTarget?.src).toBe('/game-assets-v2/islands/web-research.webp')
    expect(buildTarget?.width).toBe(390)
    expect(buildTarget?.height).toBe(381)
  })

  test('path diturunkan dari ID manifest dan kliping berada di dalam gambar', () => {
    for (const item of allRegisteredAssets()) {
      expect(item.src).toBe(`/game-assets/${item.id}.png`)
      const size = visibleSize(item)
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })
})

describe('pemetaan presentasi AI employee', () => {
  test('karakter dipilih dari arketipe peran dan deterministik', () => {
    expect(characterForAgent({ id: 'a', roleKey: 'customer-support', roleTitle: 'Customer Support Specialist' })).toBe(
      'echo',
    )
    expect(characterForAgent({ id: 'b', roleKey: 'finance-analyst', roleTitle: 'Finance Analyst' })).toBe('pixel')
    expect(characterForAgent({ id: 'c', roleKey: 'hr-recruiter', roleTitle: 'HR Recruiter' })).toBe('nova')
    expect(characterForAgent({ id: 'd', roleKey: 'sales-development', roleTitle: 'Sales Development' })).toBe('bolt')
    expect(characterForAgent({ id: 'e', roleKey: 'market-research', roleTitle: 'Market Researcher' })).toBe('sage')
  })

  test('peran tanpa kata kunci memakai hash ID yang stabil', () => {
    const input = { id: '7b0c6f1e-0000-4000-8000-000000000001', roleKey: 'xyz', roleTitle: 'Qwerty' }
    const first = characterForAgent(input)
    expect(CHARACTER_KEYS).toContain(first)
    expect(characterForAgent({ ...input })).toBe(first)
  })
})

describe('scene Virtual Office', () => {
  test('komposisi dunia: semua pulau di dalam dunia, terpisah, dan Mission Hub dominan', () => {
    const boxes = [hubBox(), ...STATIONS.map(stationBox)]
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.left + box.width).toBeLessThanOrEqual(OFFICE_WORLD.width)
      expect(box.top + box.height).toBeLessThanOrEqual(OFFICE_WORLD.height)
    }
    const centers = [
      { x: MISSION_HUB.x, y: MISSION_HUB.y },
      ...STATIONS.map((station) => ({ x: station.x, y: station.y })),
    ]
    for (const [index, a] of centers.entries()) {
      for (const b of centers.slice(index + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(150)
    }
    const widest = Math.max(...STATIONS.map((station) => station.width))
    expect(MISSION_HUB.width).toBeGreaterThan(widest)
    expect(STATIONS.filter((station) => station.depth === 'near')).toHaveLength(7)
    expect(STATIONS.every((station) => station.id in ISLANDS)).toBe(true)
  })

  test('agent diarsipkan tidak digambar; penempatan mengikuti peran', () => {
    const support = agent('customer-support')
    const analyst = agent('finance-analyst', { lifecycleStatus: 'paused' })
    const archived = agent('hr-recruiter', { lifecycleStatus: 'archived' })
    const scene = buildOfficeScene([support, analyst, archived])

    expect(scene.placements.get(support.id)?.stationId).toBe('client-brief')
    expect(scene.placements.get(analyst.id)?.stationId).toBe('analytics-tool')
    expect(scene.placements.has(archived.id)).toBe(false)

    const states = new Map(scene.stations.map((station) => [station.definition.id, station.state]))
    expect(states.get('client-brief')).toBe('active')
    expect(states.get('analytics-tool')).toBe('standby')
    expect(states.get('training-center')).toBe('empty')
  })

  test('agent baru tidak menggeser penempatan agent lama', () => {
    const early = [agent('customer-support'), agent('customer-support'), agent('finance-analyst')]
    const before = buildOfficeScene(early)
    const after = buildOfficeScene([...early, agent('customer-support'), agent('custom-role')])
    for (const item of early) {
      expect(after.placements.get(item.id)?.stationId).toBe(before.placements.get(item.id)?.stationId)
      expect(after.placements.get(item.id)?.slot).toBe(before.placements.get(item.id)?.slot)
    }
  })

  test('slot penuh → fallback ke stasiun lain; semua pulau penuh → overflow jujur', () => {
    const capacity = STATIONS.reduce((total, station) => total + stationSlots(station).length, 0)
    const crowd = Array.from({ length: capacity + 3 }, () => agent('customer-support'))
    const scene = buildOfficeScene(crowd)
    expect(scene.placements.size).toBe(capacity)
    expect(scene.overflow).toHaveLength(3)
    for (const station of scene.stations)
      expect(station.agents.length).toBeLessThanOrEqual(stationSlots(station.definition).length)
  })

  test('jaringan energi: satu spoke per stasiun + rute misi + tautan, seluruhnya di dalam dunia', () => {
    const connections = energyConnections()
    const spokes = connections.filter((connection) => connection.kind === 'spoke')
    expect(spokes.map((connection) => connection.to).sort()).toEqual(STATIONS.map((station) => station.id).sort())
    expect(connections.some((connection) => connection.kind === 'mission')).toBe(true)
    expect(connections.some((connection) => connection.kind === 'link')).toBe(true)
    expect(new Set(connections.map((connection) => connection.key)).size).toBe(connections.length)
    for (const connection of connections) {
      expect(connection.mid.x).toBeGreaterThanOrEqual(0)
      expect(connection.mid.x).toBeLessThanOrEqual(OFFICE_WORLD.width)
      expect(connection.mid.y).toBeGreaterThanOrEqual(0)
      expect(connection.mid.y).toBeLessThanOrEqual(OFFICE_WORLD.height)
    }
  })
})

describe('mode pratinjau desain', () => {
  test('menampilkan kelima karakter di lima stasiun berbeda, ditandai pratinjau', () => {
    const actors = previewActors()
    expect(actors.map((actor) => actor.character).sort()).toEqual([...CHARACTER_KEYS].sort())
    expect(new Set(actors.map((actor) => actor.stationId)).size).toBe(5)
    expect(actors.every((actor) => actor.preview && actor.lifecycle === null && actor.key.startsWith('preview:'))).toBe(
      true,
    )
    expect(previewRoster().every((entry) => entry.preview)).toBe(true)
    expect(PREVIEW_MISSION.preview).toBe(true)
  })

  test('status stasiun live tidak tercampur nilai pratinjau', () => {
    const scene = buildOfficeScene([agent('finance-analyst', { lifecycleStatus: 'paused' })])
    expect(stationStatesFor(scene, false).get('analytics-tool')).toBe('standby')
    expect(stationStatesFor(scene, false).get('web-research')).toBe('empty')
    expect(stationStatesFor(scene, true).get('web-research')).toBe('active')
  })
})

describe('misi persiapan kantor', () => {
  test('progres dihitung dari data nyata; runtime selalu terkunci', () => {
    const empty = deriveSetupMission({ tenantName: 'PT Contoh', activeMemberCount: 1, agents: [] })
    expect(empty.completed).toBe(1)
    expect(empty.steps.find((step) => step.id === 'runtime')?.status).toBe('locked')

    const ready = deriveSetupMission({
      tenantName: 'PT Contoh',
      activeMemberCount: 3,
      agents: [{ lifecycleStatus: 'active' }, { lifecycleStatus: 'draft' }],
    })
    expect(ready.completed).toBe(4)
    expect(ready.total).toBe(5)
    expect(ready.progress).toBe(80)
  })

  test('agent arsip/draf tidak dihitung sebagai aktif', () => {
    const mission = deriveSetupMission({
      tenantName: 'PT Contoh',
      activeMemberCount: 1,
      agents: [{ lifecycleStatus: 'archived' }, { lifecycleStatus: 'draft' }],
    })
    const status = Object.fromEntries(mission.steps.map((step) => [step.id, step.status]))
    expect(status.recruit).toBe('done')
    expect(status.activate).toBe('todo')
    expect(status.team).toBe('todo')
  })
})
