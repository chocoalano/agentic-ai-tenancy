import { ListTodo } from '@lucide/vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { TooltipProvider } from '#components'
import AgentCard from '~/components/agents/AgentCard.vue'
import AgentStatusBadge from '~/components/agents/AgentStatusBadge.vue'
import AgentCommandPanel from '~/components/office/AgentCommandPanel.vue'
import AgentRoster from '~/components/office/AgentRoster.vue'
import GameWorld from '~/components/office/GameWorld.vue'
import StatCard from '~/components/shared/StatCard.vue'
import type { OfficeAgentView } from '~/composables/useOfficeEngine'
import { OfficeEngine } from '~/game/engine'
import { liveAgentSpecs } from '~/game/live-adapter'
import { atlasAgentSpecs } from '~/game/simulation'
import { buildWorld } from '~/game/world'
import type { AgentSummary } from '~/utils/api-types'
import { buildOfficeScene } from '~/utils/office-layout'
import { previewRoster, stationStatesFor } from '~/utils/office-preview'

const agent: AgentSummary = {
  id: '6d1f0d1e-8a3f-4d8e-9a77-1f0c2b3a4d5e',
  slug: 'nara',
  name: 'Nara',
  roleKey: 'customer-support',
  roleTitle: 'Customer Support Specialist',
  description: 'Menjawab pertanyaan pelanggan.',
  lifecycleStatus: 'active',
  runtimeStatus: null,
  isSeedData: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

function captureWarnings() {
  const warnings: string[] = []
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => warnings.push(args.map(String).join(' ')))
  return warnings
}

afterEach(() => vi.restoreAllMocks())

describe('komponen shadcn-vue + komponen domain', () => {
  it('AgentCard merender primitive shadcn-vue tanpa peringatan resolusi komponen', async () => {
    const warnings = captureWarnings()
    const wrapper = await mountSuspended(
      defineComponent({ render: () => h(TooltipProvider, null, () => h(AgentCard, { agent })) }),
    )
    expect(wrapper.text()).toContain('Nara')
    expect(wrapper.text()).toContain('Customer Support Specialist')
    // Primitive shadcn-vue (style new-york-v4) menandai elemen dengan data-slot.
    expect(wrapper.find('[data-slot="card"]').exists()).toBe(true)
    expect(wrapper.find('[data-slot="badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-slot="avatar"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/agents/6d1f0d1e-8a3f-4d8e-9a77-1f0c2b3a4d5e"]').exists()).toBe(true)
    expect(warnings.filter((message) => /Failed to resolve component|Unknown custom element/i.test(message))).toEqual(
      [],
    )
  })

  it('status runtime null ditampilkan jujur sebagai "Runtime belum terhubung"', async () => {
    const wrapper = await mountSuspended(AgentStatusBadge, { props: { kind: 'runtime', status: null } })
    expect(wrapper.text()).toBe('Runtime belum terhubung')
  })

  it('status siklus hidup memakai label Bahasa Indonesia', async () => {
    const wrapper = await mountSuspended(AgentStatusBadge, { props: { kind: 'lifecycle', status: 'paused' } })
    expect(wrapper.text()).toBe('Dijeda')
  })

  it('kartu metrik yang belum tersedia tidak menampilkan angka karangan', async () => {
    const wrapper = await mountSuspended(StatCard, {
      props: { label: 'Tugas aktif', icon: ListTodo, unavailable: 'Modul tugas hadir di Wave 2.' },
    })
    expect(wrapper.text()).toContain('Belum tersedia')
    // Elemen nilai numerik (tabular-nums) tidak dirender sama sekali.
    expect(wrapper.find('.tabular-nums').exists()).toBe(false)
  })
})

describe('Virtual Office memakai aset game asli', () => {
  const team: AgentSummary[] = [
    agent,
    {
      ...agent,
      id: '9a3e5c1b-2d4f-4a6b-8c7d-0e1f2a3b4c5d',
      slug: 'sekar',
      name: 'Sekar',
      roleKey: 'finance-analyst',
      roleTitle: 'Finance Analyst',
      lifecycleStatus: 'paused',
    },
  ]

  it('AgentCard menampilkan sprite robot PNG dari asset pack', async () => {
    const wrapper = await mountSuspended(
      defineComponent({ render: () => h(TooltipProvider, null, () => h(AgentCard, { agent })) }),
    )
    // customer-support → arketipe Operator → karakter Echo (aset v2 diperbaiki).
    const sprite = wrapper.find('img[data-asset="characters/echo"]')
    expect(sprite.exists()).toBe(true)
    expect(sprite.attributes('src')).toBe('/game-assets-v2/characters/echo.webp')
  })

  const NAMES = { nova: 'Nova', sage: 'Sage', pixel: 'Pixel', bolt: 'Bolt', echo: 'Echo' }

  function views(preview: boolean): OfficeAgentView[] {
    const scene = buildOfficeScene(team)
    const engine = new OfficeEngine(buildWorld())
    engine.setAgents(
      preview
        ? atlasAgentSpecs(NAMES)
        : liveAgentSpecs(
            team,
            new Map(
              [...scene.placements.values()].map((placed) => [
                placed.agent.id,
                { character: placed.character, stationId: placed.stationId, slot: placed.slot },
              ]),
            ),
          ),
    )
    return [...engine.agents.values()].map((item) => ({
      key: item.key,
      character: item.character,
      name: item.name,
      preview: item.preview,
      island: item.island,
      slot: item.slot,
      activity: item.activity,
      label: 'Siaga',
      speech: null,
      moving: false,
      destination: null,
      x: item.position.x,
      y: item.position.y,
      log: [],
    }))
  }

  function worldProps(preview: boolean) {
    return {
      agents: views(preview),
      stationStates: stationStatesFor(buildOfficeScene(team), preview),
      occupants: new Map(),
      activeStations: [],
      targetedStations: [],
      portalFlashes: [],
      missionCompleted: 4,
      missionTotal: 5,
      preview,
      selection: null,
      locate: () => null,
    }
  }

  it('dunia live merender Mission Hub, sembilan pulau, jaringan energi, dan satu robot per AI employee', async () => {
    const wrapper = await mountSuspended(
      defineComponent({ render: () => h(TooltipProvider, null, () => h(GameWorld, worldProps(false))) }),
    )
    const islands = wrapper.findAll('img[data-asset^="islands/"]').map((image) => image.attributes('data-asset'))
    expect(islands).toContain('islands/mission-hub')
    expect(new Set(islands).size).toBe(10)
    expect(wrapper.findAll('[data-actor]')).toHaveLength(2)
    expect(wrapper.findAll('[data-preview="true"]')).toHaveLength(0)
    // Robot = sprite sheet animasi v2 (bukan PNG statis); paused → offline.
    const sprite = wrapper.find('[data-actor] button[data-asset^="agents/"]')
    expect(sprite.attributes('style')).toContain('/game-assets-v2/agents/')
    expect(wrapper.findAll('[data-activity="offline"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-orb]')).toHaveLength(2)
    expect(wrapper.find('[data-energy-network]').exists()).toBe(true)
    expect(wrapper.find('[data-asset="fx/portal-cyan"]').exists()).toBe(true)
  })

  it('mode pratinjau menampilkan kelima karakter animasi sebagai pratinjau', async () => {
    const wrapper = await mountSuspended(
      defineComponent({ render: () => h(TooltipProvider, null, () => h(GameWorld, worldProps(true))) }),
    )
    const sheets = wrapper
      .findAll('[data-actor] button[data-asset^="agents/"]')
      .map((button) => button.attributes('data-asset'))
    expect(new Set(sheets)).toEqual(
      new Set(['agents/nova', 'agents/sage', 'agents/pixel', 'agents/bolt', 'agents/echo']),
    )
    expect(wrapper.findAll('[data-preview="true"]')).toHaveLength(5)
  })

  it('klik pulau memancarkan seleksi stasiun', async () => {
    const wrapper = await mountSuspended(GameWorld, {
      props: worldProps(false),
      global: { stubs: { OfficeActor: true } },
    })
    await wrapper.find('button[data-station="web-research"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'station', stationId: 'web-research' }])
  })

  it('roster live kosong jujur menampilkan 0 dan ajakan pratinjau', async () => {
    const wrapper = await mountSuspended(AgentRoster, {
      props: { entries: [], preview: false, realCount: 0, activeCount: 0, selection: null },
    })
    expect(wrapper.text()).toContain('AI employee direkrut')
    expect(wrapper.text()).toContain('Lihat pratinjau kantor')
    const cta = wrapper.findAll('button').find((button) => button.text().includes('Lihat pratinjau kantor'))
    await cta?.trigger('click')
    expect(wrapper.emitted('togglePreview')).toHaveLength(1)
  })

  it('roster pratinjau menandai karakter contoh sebagai SIMULASI, berbeda dari roster live', async () => {
    const entries = previewRoster()
    const preview = await mountSuspended(AgentRoster, {
      props: { entries, preview: true, realCount: 0, activeCount: 0, selection: null },
    })
    // Label pembeda wajib ada: karakter contoh, bukan AI employee nyata.
    expect(preview.text()).toContain('SIMULASI')
    expect(preview.text()).toContain('Karakter contoh')
    expect(preview.text()).toContain(`${entries.length} / ${entries.length}`)
    expect(preview.text()).toContain('Nova')

    const live = await mountSuspended(AgentRoster, {
      props: { entries: [], preview: false, realCount: 0, activeCount: 0, selection: null },
    })
    expect(live.text()).not.toContain('SIMULASI')
    expect(live.text()).toContain('AI employee direkrut')
    expect(live.text()).toContain('bukan agent nyata')
  })

  it('panel perintah pratinjau: permintaan persetujuan menampilkan kontrol simulasi (live: tidak)', async () => {
    const sage = views(true).find((item) => item.character === 'sage')
    if (!sage) throw new Error('Sage tidak ada')
    const waiting = { ...sage, activity: 'waiting_approval' as const, label: 'Menunggu persetujuan' }
    const mount = (preview: boolean) =>
      mountSuspended(
        defineComponent({
          render: () =>
            h(TooltipProvider, null, () =>
              h(AgentCommandPanel, { agent: waiting, preview, roleTitle: 'Peneliti', feedback: null }),
            ),
        }),
      )
    const wrapper = await mount(true)
    expect(wrapper.find('[data-approval-request]').text()).toContain('SIMULASI')
    await wrapper.find('[data-approve]').trigger('click')
    await wrapper.find('[data-reject]').trigger('click')
    const panel = wrapper.findComponent(AgentCommandPanel)
    expect(panel.emitted('approve')).toHaveLength(1)
    expect(panel.emitted('reject')).toHaveLength(1)
    expect((await mount(false)).find('[data-approval-request]').exists()).toBe(false)
  })

  it('panel perintah live: perintah bisnis nonaktif & instruksi terkunci (tidak ada endpoint)', async () => {
    const live = views(false)[0]
    if (!live) throw new Error('tidak ada agent live')
    const wrapper = await mountSuspended(
      defineComponent({
        render: () =>
          h(TooltipProvider, null, () =>
            h(AgentCommandPanel, {
              agent: live,
              preview: false,
              liveAgent: agent,
              roleTitle: agent.roleTitle,
              feedback: null,
            }),
          ),
      }),
    )
    for (const key of ['assign_task', 'chat', 'pause', 'resume']) {
      expect(wrapper.find(`[data-command-key="${key}"]`).attributes('aria-disabled')).toBe('true')
    }
    expect(wrapper.find('[data-command-key="move"]').attributes('aria-disabled')).toBe('false')
    expect(wrapper.find('[data-instruction-input]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Runtime belum terhubung')
  })

  it('panel perintah pratinjau: instruksi dapat dikirim sebagai simulasi', async () => {
    const sage = views(true).find((item) => item.character === 'sage')
    if (!sage) throw new Error('Sage tidak ada')
    const wrapper = await mountSuspended(
      defineComponent({
        render: () =>
          h(TooltipProvider, null, () =>
            h(AgentCommandPanel, { agent: sage, preview: true, roleTitle: 'Peneliti', feedback: null }),
          ),
      }),
    )
    expect(wrapper.text()).toContain('SIMULASI')
    await wrapper.find('[data-instruction-input]').setValue('Sage, lakukan riset pasar.')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.findComponent(AgentCommandPanel).emitted('instruct')?.[0]).toEqual(['Sage, lakukan riset pasar.'])
  })
})
