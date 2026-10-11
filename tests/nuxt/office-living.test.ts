import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { TooltipProvider } from '#components'
import OfficeActor from '~/components/office/OfficeActor.vue'
import OfficeWorkstationEffects from '~/components/office/OfficeWorkstationEffects.vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import { buildWorld } from '~/game/world'
import type { WorkstationVisual } from '~/game/workstations'

const world = buildWorld()

function visual(
  partial: Partial<WorkstationVisual> & Pick<WorkstationVisual, 'island' | 'effects'>,
): WorkstationVisual {
  return {
    activityId: null,
    label: 'Aktivitas',
    anchors: [{ key: 'preview:sage', slot: 0, anchorId: 'slot-0' }],
    durationMode: 'simulated',
    ...partial,
  }
}

describe('efek workstation (OfficeWorkstationEffects)', () => {
  it('efek per anchor ditambatkan ke titik slot geometri dalam koordinat dunia, tepat di depan robot', async () => {
    const wrapper = await mountSuspended(OfficeWorkstationEffects, {
      props: {
        visuals: [
          visual({
            island: 'web-research',
            activityId: 'web-research:research',
            effects: ['document-holograms', 'search-rings'],
          }),
        ],
        ambientIslands: ['analytics-tool'],
      },
    })
    const point = world.islands.get('web-research')?.workstations[0]?.point
    if (!point) throw new Error('slot web-research tidak ada')
    const docs = wrapper.find('[data-workstation-effect="document-holograms"]')
    expect(docs.exists()).toBe(true)
    expect(docs.attributes('data-workstation-island')).toBe('web-research')
    expect(docs.attributes('style')).toContain(`--ax: ${point.x.toFixed(1)}`)
    expect(docs.attributes('style')).toContain(`--ay: ${point.y.toFixed(1)}`)
    expect(docs.attributes('style')).toContain(`z-index: ${100 + Math.round(point.y) + 1}`)
    expect(wrapper.findAll('[data-workstation-effect]')).toHaveLength(2)
    // Artwork efek = fx/* dari asset pack; panel dokumen = glyph prosedural.
    expect(wrapper.find('[data-workstation-effect="search-rings"] img[data-asset="fx/energy-ring"]').exists()).toBe(
      true,
    )
    expect(docs.findAll('.holo-card')).toHaveLength(3)
    // Hologram pulau ambient di pulau lain.
    expect(wrapper.find('[data-ambient-island="analytics-tool"]').exists()).toBe(true)
  })

  it('hologram misi Mission Hub ditambatkan ke pusat pulau (di belakang robot), bukan ke slot robot', async () => {
    const wrapper = await mountSuspended(OfficeWorkstationEffects, {
      props: {
        visuals: [
          visual({
            island: 'mission-hub',
            activityId: 'mission-hub:coordinate',
            effects: ['mission-hologram', 'signal-pulse'],
            anchors: [{ key: 'preview:nova', slot: 1, anchorId: 'slot-1' }],
          }),
        ],
        ambientIslands: [],
      },
    })
    const hub = world.islands.get('mission-hub')?.hub
    if (!hub) throw new Error('hub tidak ada')
    const hologram = wrapper.find('[data-workstation-effect="mission-hologram"]')
    expect(hologram.attributes('style')).toContain(`--ax: ${hub.x.toFixed(1)}`)
    expect(hologram.attributes('style')).toContain(`z-index: ${100 + Math.round(hub.y) - 2}`)
    expect(hologram.find('img[data-asset="fx/hologram-cube"]').exists()).toBe(true)
    expect(wrapper.find('[data-workstation-effect="signal-pulse"]').exists()).toBe(true)
  })

  it('kantor siaga tanpa visual: tidak ada elemen efek sama sekali (ringan)', async () => {
    const wrapper = await mountSuspended(OfficeWorkstationEffects, { props: { visuals: [], ambientIslands: [] } })
    expect(wrapper.findAll('[data-workstation-effect]')).toHaveLength(0)
    expect(wrapper.findAll('[data-ambient-island]')).toHaveLength(0)
  })

  it('reaksi persetujuan/selesai/gagal dirender sebagai efek di anchor robot', async () => {
    const wrapper = await mountSuspended(OfficeWorkstationEffects, {
      props: {
        visuals: [
          visual({ island: 'data-warehouse', effects: ['approval-beacon'] }),
          visual({ island: 'report-builder', effects: ['completion-burst'] }),
          visual({ island: 'client-brief', effects: ['error-flicker'] }),
        ],
        ambientIslands: [],
      },
    })
    expect(wrapper.find('[data-workstation-effect="approval-beacon"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-workstation-effect="completion-burst"] img[data-asset="fx/energy-spawn"]').exists(),
    ).toBe(true)
    expect(wrapper.find('[data-workstation-effect="error-flicker"]').exists()).toBe(true)
  })
})

describe('OfficeActor: umpan balik perintah & kontak tanah', () => {
  const base: OfficeAgentView = {
    key: 'preview:sage',
    character: 'sage',
    name: 'Sage',
    preview: true,
    island: 'web-research',
    slot: 0,
    activity: 'thinking',
    label: 'Menerima perintah',
    speech: 'Siap, menuju Web Research.',
    moving: false,
    destination: 'web-research',
    heading: 'toward',
    acknowledging: true,
    workstationActivity: null,
    x: 600,
    y: 300,
    log: [],
  }

  function host(agent: OfficeAgentView, selected: boolean) {
    return defineComponent({
      setup: () => () =>
        h(TooltipProvider, null, () => h(OfficeActor, { agent, stationLabel: 'Web Research', selected })),
    })
  }

  it('menampilkan bayangan kontak, sorotan pilihan, dan indikator "menerima perintah" saat perintah diterima', async () => {
    const wrapper = await mountSuspended(host(base, true))
    expect(wrapper.find('[data-actor-shadow]').exists()).toBe(true)
    expect(wrapper.find('[data-actor-selection]').exists()).toBe(true)
    expect(wrapper.find('[data-actor-ack]').exists()).toBe(true)
    expect(wrapper.find('[data-actor]').attributes('data-selected')).toBe('true')
    expect(wrapper.text()).toContain('Menerima perintah')
    expect(wrapper.text()).toContain('SIMULASI')
  })

  it('saat bekerja di stasiun, label robot memakai nama aktivitas workstation (bukan hanya state generik)', async () => {
    const working: OfficeAgentView = {
      ...base,
      activity: 'researching',
      label: 'Meriset',
      speech: null,
      destination: null,
      acknowledging: false,
      workstationActivity: 'Meriset sumber pasar',
    }
    const wrapper = await mountSuspended(host(working, false))
    expect(wrapper.find('[data-actor-ack]').exists()).toBe(false)
    expect(wrapper.find('[data-actor-selection]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Meriset sumber pasar')
  })
})
