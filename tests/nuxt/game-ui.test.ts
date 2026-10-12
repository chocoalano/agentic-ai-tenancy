import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { Bot } from '@lucide/vue'
import { defineComponent, h } from 'vue'
import { TooltipProvider } from '#components'
import GamePageHeader from '~/components/game/GamePageHeader.vue'
import GamePanel from '~/components/game/GamePanel.vue'
import GameShell from '~/components/game/GameShell.vue'
import GameTabs from '~/components/game/GameTabs.vue'
import GameTopNav from '~/components/game/GameTopNav.vue'
import { isMotionPreference, useUiPreferences } from '~/composables/useUiPreferences'
import { activeNavigation, NAVIGATION, SETTINGS_NAVIGATION } from '~/utils/navigation'

/*
 * Agentic Game UI — sistem desain bersama halaman terautentikasi:
 * varian panel, header halaman, tab, navigasi atas (konsisten dengan
 * NAVIGATION), cangkang layout, dan preferensi gerakan.
 */
describe('Agentic Game UI', () => {
  it('GamePanel: setiap varian memakai kelas token game dan menandai data-game-panel', async () => {
    const variants = ['default', 'elevated', 'holo', 'command', 'warning', 'success', 'sunken'] as const
    for (const variant of variants) {
      const wrapper = await mountSuspended(GamePanel, {
        props: { variant, title: `Panel ${variant}`, headingId: `h-${variant}` },
        slots: { default: () => 'isi', footer: () => 'kaki' },
      })
      const root = wrapper.find('[data-game-panel]')
      expect(root.attributes('data-game-panel')).toBe(variant)
      expect(root.classes()).toContain('game-panel')
      if (variant !== 'default') expect(root.classes()).toContain(`game-panel-${variant}`)
      expect(wrapper.find('h2#h-' + variant).text()).toBe(`Panel ${variant}`)
      expect(wrapper.text()).toContain('kaki')
    }
  })

  it('GamePageHeader: identitas area, judul h1, dan tautan kembali', async () => {
    const wrapper = await mountSuspended(GamePageHeader, {
      props: {
        identity: 'Commander Control Center',
        title: 'Pengaturan',
        description: 'Akun & perusahaan',
        icon: Bot,
        backTo: '/office',
        backLabel: 'Kembali ke kantor',
      },
    })
    expect(wrapper.find('[data-game-identity]').text()).toBe('Commander Control Center')
    expect(wrapper.find('h1').text()).toBe('Pengaturan')
    expect(wrapper.find('a[href="/office"]').text()).toContain('Kembali ke kantor')
    expect(wrapper.find('.game-crest').exists()).toBe(true)
  })

  it('GameTabs: pemicu bergaya game, tab aktif mengikuti modelValue, perubahan dipancarkan', async () => {
    const items = [
      { value: 'profile', label: 'Profil' },
      { value: 'company', label: 'Perusahaan', badge: 2 },
    ]
    const wrapper = await mountSuspended(GameTabs, { props: { modelValue: 'company', items, label: 'Bagian' } })
    expect(wrapper.find('[data-game-tabs]').attributes('aria-label')).toBe('Bagian')
    expect(wrapper.find('[data-tab="company"]').attributes('data-state')).toBe('active')
    expect(wrapper.find('[data-tab="profile"]').attributes('data-state')).toBe('inactive')
    expect(wrapper.find('[data-tab="company"]').text()).toContain('2')
    await wrapper.find('[data-tab="profile"]').trigger('mousedown', { button: 0 })
    await wrapper.find('[data-tab="profile"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['profile'])
  })

  it('GameTopNav: tab modul dari NAVIGATION, modul aktif ditandai, modul "soon" tidak pernah menjadi tautan', async () => {
    const wrapper = await mountSuspended(
      defineComponent({
        render: () =>
          h(TooltipProvider, null, () =>
            h(GameTopNav, { identity: 'AI Employee Headquarters', title: 'AI Employees', currentPath: '/agents/123' }),
          ),
      }),
      { route: '/agents/123' },
    )
    expect(wrapper.find('[data-nav="agents"]').attributes('data-active')).toBe('true')
    expect(wrapper.find('[data-nav="agents"]').attributes('aria-current')).toBe('page')
    expect(wrapper.find('[data-nav="office"]').attributes('data-active')).toBe('false')
    expect(wrapper.find('[data-nav="settings"]').attributes('href')).toBe(SETTINGS_NAVIGATION.to)
    for (const item of NAVIGATION.flatMap((group) => group.items).filter((entry) => entry.status === 'soon')) {
      expect(wrapper.find(`a[data-nav="${item.key}"]`).exists()).toBe(false)
    }
    expect(wrapper.find('[data-nav="upcoming"]').exists()).toBe(true)
    // Jalur kembali ke Virtual Office tersedia (menu game + tombol cepat).
    expect(wrapper.find('[data-game-menu-trigger]').exists()).toBe(true)
    expect(wrapper.find('[data-nav="office-quick"]').attributes('href')).toBe('/office')
    expect(wrapper.find('[data-game-identity-strip]').text()).toContain('AI Employee Headquarters')
  })

  it('GameShell: latar game, navigasi atas, dan area konten #konten dirender untuk halaman manajemen', async () => {
    const wrapper = await mountSuspended(
      defineComponent({
        render: () =>
          h(TooltipProvider, null, () => h(GameShell, { title: 'Pengaturan' }, () => h('p', 'konten halaman'))),
      }),
      { route: '/settings' },
    )
    expect(wrapper.find('[data-game-shell]').exists()).toBe(true)
    expect(wrapper.find('[data-game-background]').exists()).toBe(true)
    expect(wrapper.find('[data-game-topnav]').exists()).toBe(true)
    expect(wrapper.find('main#konten').text()).toContain('konten halaman')
    expect(wrapper.find('[data-slot="sidebar"]').exists()).toBe(false)
  })

  it('identitas area konsisten antara navigasi, header halaman, dan menu', () => {
    expect(activeNavigation('/settings')?.identity).toBe('Commander Control Center')
    expect(activeNavigation('/agents/abc')?.identity).toBe('AI Employee Headquarters')
    expect(activeNavigation('/tasks')?.identity).toBe('Mission Board')
    expect(activeNavigation('/office')?.identity).toBe('Interactive AI World')
    expect(activeNavigation('/tidak-ada')).toBeNull()
  })

  it('preferensi gerakan: default mengikuti sistem, dapat diubah, nilai tak dikenal ditolak', async () => {
    const probe = defineComponent({
      setup() {
        const { motion, reducedMotion, setMotion } = useUiPreferences()
        return { motion, reducedMotion, setMotion }
      },
      render() {
        return h('div', { 'data-motion': this.motion, 'data-reduced': String(this.reducedMotion) })
      },
    })
    const wrapper = await mountSuspended(probe)
    expect(wrapper.find('div').attributes('data-motion')).toBe('system')
    expect(wrapper.find('div').attributes('data-reduced')).toBe('false')
    wrapper.vm.setMotion('reduced')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('div').attributes('data-motion')).toBe('reduced')
    expect(wrapper.find('div').attributes('data-reduced')).toBe('true')
    expect(isMotionPreference('reduced')).toBe(true)
    expect(isMotionPreference('fast')).toBe(false)
    wrapper.vm.setMotion('system')
  })
})
