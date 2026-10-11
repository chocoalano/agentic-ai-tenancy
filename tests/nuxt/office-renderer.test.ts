import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { TooltipProvider } from '#components'
import OfficeActor from '~/components/office/OfficeActor.vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import { createDomRenderer } from '~/game/dom-renderer'
import { OfficeEngine, type EngineEvent } from '~/game/engine'
import { buildWorld, type IslandId } from '~/game/world'

const KEY = 'preview:sage'

/**
 * Posisi awal ditentukan EKSPLISIT per test (bukan dari ATLAS_START) agar test
 * gerak selalu memakai asal dan tujuan yang berbeda, dan test "sudah di tujuan"
 * memakai asal = tujuan dengan sengaja.
 */
function setup(island: IslandId, slot = 0) {
  const engine = new OfficeEngine(buildWorld())
  engine.setAgents([{ key: KEY, character: 'sage', name: 'Sage', island, slot, activity: 'idle', preview: true }])
  const renderer = createDomRenderer()
  const root = document.createElement('div')
  const sprite = document.createElement('button')
  const orb = document.createElement('div')
  renderer.register(KEY, root, sprite)
  renderer.registerOrb(KEY, orb)
  const events: EngineEvent[] = []
  engine.on((event) => events.push(event))
  return { engine, renderer, root, sprite, orb, events }
}

/** Majukan mesin sampai rute selesai (maks. `seconds`), mencatat animasi & orb yang terlihat. */
function runUntilArrived(ctx: ReturnType<typeof setup>, seconds = 10) {
  const animations = new Set<string>()
  const positions = new Set<string>()
  let orbShown = false
  for (let frame = 0; frame < 60 * seconds && (ctx.engine.agents.get(KEY)?.route.length ?? 0) > 0; frame += 1) {
    ctx.engine.tick(1 / 60)
    ctx.renderer.render(ctx.engine.renderStates())
    animations.add(ctx.sprite.dataset.animation ?? '')
    positions.add(ctx.root.style.getPropertyValue('--ax'))
    if (ctx.orb.style.display === 'block') {
      orbShown = true
      expect(ctx.root.style.visibility).toBe('hidden')
      expect(ctx.orb.style.getPropertyValue('--ox')).not.toBe('')
    }
  }
  ctx.renderer.render(ctx.engine.renderStates())
  return { animations, positions, orbShown }
}

describe('renderer DOM Virtual Office', () => {
  it('menulis posisi pada frame pertama dan setiap frame selama berjalan (asal ≠ tujuan)', () => {
    const ctx = setup('mission-hub')
    ctx.renderer.render(ctx.engine.renderStates())
    const start = ctx.engine.agents.get(KEY)?.position
    expect(ctx.root.style.getPropertyValue('--ax')).toBe(start?.x.toFixed(2))
    expect(ctx.root.style.getPropertyValue('--ay')).toBe(start?.y.toFixed(2))
    expect(ctx.sprite.dataset.animation).toBe('idle')

    expect(ctx.engine.moveTo(KEY, { island: 'web-research' }, { state: 'researching' })).toBe(true)
    const written = new Set<string>()
    for (let frame = 0; frame < 30; frame += 1) {
      ctx.engine.tick(1 / 60)
      ctx.renderer.render(ctx.engine.renderStates())
      written.add(ctx.root.style.getPropertyValue('--ax'))
    }
    expect(ctx.sprite.dataset.animation).toBe('walk')
    // 30 frame berjalan → posisi berubah hampir setiap frame (bukan lompat per event).
    expect(written.size).toBeGreaterThan(25)
  })

  it('antar pulau: menyembunyikan robot dan menampilkan orb selama transit teleport, lalu tiba', () => {
    const ctx = setup('mission-hub')
    expect(ctx.engine.moveTo(KEY, { island: 'web-research' })).toBe(true)
    const { animations, orbShown } = runUntilArrived(ctx)
    expect(orbShown).toBe(true)
    expect(animations.has('walk')).toBe(true)
    expect(animations.has('teleport')).toBe(true)
    expect(ctx.orb.style.display).toBe('none')
    expect(ctx.root.style.visibility).toBe('')
    expect(ctx.engine.agents.get(KEY)?.island).toBe('web-research')
  })

  it('pulau yang sama, slot berbeda: berjalan tanpa teleport/orb', () => {
    const ctx = setup('web-research', 0)
    expect(ctx.engine.moveTo(KEY, { island: 'web-research', slot: 1 })).toBe(true)
    const { animations, orbShown, positions } = runUntilArrived(ctx)
    expect(orbShown).toBe(false)
    expect(animations.has('walk')).toBe(true)
    expect(animations.has('teleport')).toBe(false)
    expect(positions.size).toBeGreaterThan(5)
    expect(ctx.engine.agents.get(KEY)?.slot).toBe(1)
  })

  it('sudah di tujuan (jarak nol): tiba seketika tanpa animasi jalan/teleport, state kerja langsung dipakai', () => {
    const ctx = setup('web-research', 0)
    ctx.renderer.render(ctx.engine.renderStates())
    const before = ctx.root.style.getPropertyValue('--ax')
    expect(ctx.engine.moveTo(KEY, { island: 'web-research', slot: 0 }, { state: 'researching' })).toBe(true)
    const agent = ctx.engine.agents.get(KEY)
    expect(agent?.route).toEqual([])
    expect(agent?.activity).toBe('researching')
    expect(ctx.events.filter((event) => event.type === 'arrived')).toHaveLength(1)
    expect(ctx.events.some((event) => event.type === 'route' || event.type === 'teleport')).toBe(false)

    const { animations, orbShown } = runUntilArrived(ctx, 1)
    for (let frame = 0; frame < 30; frame += 1) {
      ctx.engine.tick(1 / 60)
      ctx.renderer.render(ctx.engine.renderStates())
      animations.add(ctx.sprite.dataset.animation ?? '')
    }
    expect(orbShown).toBe(false)
    expect(animations.has('walk')).toBe(false)
    expect(animations.has('teleport')).toBe(false)
    expect(ctx.sprite.dataset.animation).toBe('read')
    expect(ctx.root.style.getPropertyValue('--ax')).toBe(before)
  })

  it('state saat tiba: berhenti tepat di anchor workstation, aktivitas rencana aktif, satu event arrived', () => {
    const ctx = setup('mission-hub')
    expect(ctx.engine.moveTo(KEY, { island: 'analytics-tool', slot: 1 }, { state: 'working' })).toBe(true)
    runUntilArrived(ctx)
    const agent = ctx.engine.agents.get(KEY)
    const target = ctx.engine.stationPoint('analytics-tool', 1)
    expect(agent?.position).toEqual(target)
    expect(agent?.island).toBe('analytics-tool')
    expect(agent?.slot).toBe(1)
    expect(agent?.activity).toBe('working')
    expect(ctx.root.style.getPropertyValue('--ax')).toBe(target.x.toFixed(2))
    expect(ctx.root.style.getPropertyValue('--ay')).toBe(target.y.toFixed(2))
    expect(ctx.sprite.dataset.animation).toBe('work')
    expect(ctx.events.filter((event) => event.type === 'arrived')).toHaveLength(1)
  })
})

describe('OfficeActor', () => {
  const agent: OfficeAgentView = {
    key: 'preview:sage',
    character: 'sage',
    name: 'Sage',
    preview: true,
    island: 'mission-hub',
    slot: 0,
    activity: 'idle',
    label: 'Siaga',
    speech: null,
    moving: false,
    destination: null,
    heading: 'toward',
    acknowledging: false,
    workstationActivity: null,
    x: 100,
    y: 200,
    log: [],
  }

  it('posisi Vue hanya posisi awal; snapshot baru tidak menimpa tulisan renderer', async () => {
    const Host = defineComponent({
      props: { agent: { type: Object as () => OfficeAgentView, required: true } },
      setup: (props) => () =>
        h(TooltipProvider, null, () => h(OfficeActor, { agent: props.agent, stationLabel: 'Mission Hub' })),
    })
    const wrapper = await mountSuspended(Host, { props: { agent } })
    const root = wrapper.find('[data-actor="preview:sage"]')
    expect(root.attributes('style')).toContain('--ax: 100')

    // Renderer menulis posisi terbaru, lalu snapshot (event) membawa posisi lama.
    const element = root.element
    if (!(element instanceof HTMLElement)) throw new Error('root bukan HTMLElement')
    element.style.setProperty('--ax', '321.00')
    await wrapper.setProps({ agent: { ...agent, x: 150, activity: 'moving', label: 'Berpindah', moving: true } })
    expect(element.style.getPropertyValue('--ax')).toBe('321.00')
    expect(root.attributes('data-activity')).toBe('moving')
  })
})
