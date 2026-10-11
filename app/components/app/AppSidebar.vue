<script setup lang="ts">
import { Lock, PanelLeftClose, PanelLeftOpen } from '@lucide/vue'
import { useSidebar } from '~/components/ui/sidebar'

/**
 * Navigasi utama. Modul yang belum dibangun tampil nonaktif dengan label
 * rilis (tanpa tautan) — tidak ada halaman rusak. Desktop: dapat diciutkan
 * menjadi rel ikon (⌘/Ctrl+B); tablet: ringkas; mobile: drawer.
 */
const route = useRoute()
const { isMobile, state, toggleSidebar, setOpenMobile } = useSidebar()
const settings = SETTINGS_NAVIGATION

// Tutup drawer mobile setelah berpindah halaman.
watch(
  () => route.fullPath,
  () => setOpenMobile(false),
)
</script>

<template>
  <Sidebar collapsible="icon" variant="inset">
    <SidebarHeader class="gap-3 pb-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child size="lg" class="hover:bg-transparent active:bg-transparent">
            <NuxtLink to="/office" aria-label="Beranda Virtual Office"><AppLogo /></NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu v-if="isMobile">
        <SidebarMenuItem>
          <TenantSwitcher variant="sidebar" />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent class="gap-0">
      <SidebarGroup v-for="group in NAVIGATION" :key="group.key" class="py-1.5">
        <SidebarGroupLabel class="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          {{ group.label }}
        </SidebarGroupLabel>
        <SidebarMenu class="gap-0.5">
          <SidebarMenuItem v-for="item in group.items" :key="item.key">
            <SidebarMenuButton
              v-if="item.to"
              as-child
              :is-active="isNavigationActive(item, route.path)"
              :tooltip="item.label"
              class="nav-item h-9"
            >
              <NuxtLink :to="item.to" :aria-current="isNavigationActive(item, route.path) ? 'page' : undefined">
                <component :is="item.icon" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </NuxtLink>
            </SidebarMenuButton>
            <template v-else>
              <SidebarMenuButton
                aria-disabled="true"
                :tooltip="`${item.label} — segera hadir (${item.release})`"
                class="h-9 cursor-not-allowed opacity-55 hover:bg-transparent hover:text-sidebar-foreground"
                @click.prevent
              >
                <component :is="item.icon" aria-hidden="true" />
                <span>{{ item.label }}</span>
                <span class="sr-only">— belum tersedia, direncanakan {{ item.release }}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge class="gap-1 text-[10px] font-medium text-muted-foreground">
                <Lock class="size-3" aria-hidden="true" />{{ item.release }}
              </SidebarMenuBadge>
            </template>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter class="gap-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            as-child
            :is-active="isNavigationActive(settings, route.path)"
            :tooltip="settings.label"
            class="nav-item h-9"
          >
            <NuxtLink
              :to="settings.to ?? '/settings'"
              :aria-current="isNavigationActive(settings, route.path) ? 'page' : undefined"
            >
              <component :is="settings.icon" aria-hidden="true" />
              <span>{{ settings.label }}</span>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <div
        class="surface-sunken rounded-xl px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden"
      >
        <p class="font-medium text-foreground/90">Phase 1 · fondasi platform</p>
        <p>Modul bertanda kunci sedang dibangun.</p>
      </div>
      <SidebarMenu v-if="!isMobile">
        <SidebarMenuItem>
          <SidebarMenuButton
            class="h-8 text-xs text-muted-foreground"
            :tooltip="state === 'expanded' ? 'Ciutkan sidebar (⌘/Ctrl+B)' : 'Bentangkan sidebar (⌘/Ctrl+B)'"
            :aria-label="state === 'expanded' ? 'Ciutkan sidebar' : 'Bentangkan sidebar'"
            @click="toggleSidebar"
          >
            <PanelLeftClose v-if="state === 'expanded'" aria-hidden="true" />
            <PanelLeftOpen v-else aria-hidden="true" />
            <span>Ciutkan sidebar</span>
            <span class="ml-auto text-[10px] text-muted-foreground/70" aria-hidden="true">⌘/Ctrl B</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
