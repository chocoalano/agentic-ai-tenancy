import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { TooltipProvider } from '#components'
import OfficeActor from '~/components/office/OfficeActor.vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import { createDomRenderer } from '~/game/dom-renderer'
import { OfficeEngine } from '~/game/engine'
import { atlasAgentSpecs } from '~/game/simulation'
import { buildWorld } from '~/game/world'

const NAMES = { nova: 'Nova', sage: 'Sage', pixel: 'Pixel', bolt: 'Bolt', echo: 'Echo' }

function setup() {
  const engine = new OfficeEngine(buildWorld())
  engine.setAgents(atlasAgentSpecs(NAMES))
  const renderer = createDomRenderer()
  const root = document.createElement('div')
  const sprite = document.createElement('button')
  const orb = document.createElement('div')
  renderer.register('preview:sage', root, sprite)
  renderer.registerOrb('preview:sage', orb)
  return { engine, renderer, root, sprite, orb }
}

describe('renderer DOM Virtual Office', () => {
  it('menulis posisi pada frame pertama dan setiap frame selama berjalan', () => {
    const { engine, renderer, root, sprite } = setup()
    renderer.render(engine.renderStates())
    const start = engine.agents.get('preview:sage')?.position
    expect(root.style.getPropertyValue('--ax')).toBe(start?.x.toFixed(2))
    expect(root.style.getPropertyValue('--ay')).toBe(start?.y.toFixed(2))
    expect(sprite.dataset.animation).toBe('idle')

    expect(engine.moveTo('preview:sage', { island: 'web-research' }, { state: 'researching' })).toBe(true)
    const written = new Set<string>()
    for (let frame = 0; frame < 30; frame += 1) {
      engine.tick(1 / 60)
      renderer.render(engine.renderStates())
      written.add(root.style.getPropertyValue('--ax'))
    }
    expect(sprite.dataset.animation).toBe('walk')
    // 30 frame berjalan → posisi berubah hampir setiap frame (bukan lompat per event).
    expect(written.size).toBeGreaterThan(25)
  })

  it('menyembunyikan robot dan menampilkan orb selama transit teleport', () => {
    const { engine, renderer, root, orb } = setup()
    engine.moveTo('preview:sage', { island: 'web-research' })
    let sawOrb = false
    for (let frame = 0; frame < 60 * 8 && engine.agents.get('preview:sage')?.route.length; frame += 1) {
      engine.tick(1 / 60)
      renderer.render(engine.renderStates())
      if (orb.style.display === 'block') {
        sawOrb = true
        expect(root.style.visibility).toBe('hidden')
        expect(orb.style.getPropertyValue('--ox')).not.toBe('')
      }
    }
    expect(sawOrb).toBe(true)
    expect(orb.style.display).toBe('none')
    expect(root.style.visibility).toBe('')
    expect(engine.agents.get('preview:sage')?.island).toBe('web-research')
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
