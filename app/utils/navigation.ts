import type { Component } from 'vue'
import { BookOpen, Bot, Building2, ChartLine, CreditCard, ListChecks, Plug, Settings, Store, Target } from '@lucide/vue'

/*
 * Peta navigasi aplikasi terautentikasi. Satu sumber untuk sidebar dan
 * pencarian global. Modul yang belum dibangun berstatus `soon`: ditampilkan
 * nonaktif (tanpa tautan) agar tidak ada halaman rusak atau fitur palsu.
 */
export interface NavigationItem {
  key: string
  label: string
  description: string
  icon: Component
  /** Path halaman; hanya ada untuk modul yang sudah tersedia. */
  to?: string
  status: 'available' | 'soon'
  /** Rilis yang direncanakan untuk modul `soon` (lihat docs/frontend-roadmap.md). */
  release?: string
  /** Identitas area di dunia game (eyebrow header halaman, menu game). */
  identity: string
}

export interface NavigationGroup {
  key: string
  label: string
  items: NavigationItem[]
}

export const NAVIGATION: NavigationGroup[] = [
  {
    key: 'operations',
    label: 'Operasional',
    items: [
      {
        key: 'office',
        identity: 'Interactive AI World',
        label: 'Virtual Office',
        description: 'Lantai kantor dan ringkasan operasional',
        icon: Building2,
        to: '/office',
        status: 'available',
      },
      {
        key: 'agents',
        identity: 'AI Employee Headquarters',
        label: 'AI Employees',
        description: 'Direktori AI employee perusahaan',
        icon: Bot,
        to: '/agents',
        status: 'available',
      },
      {
        key: 'tasks',
        identity: 'Mission Board',
        label: 'Tugas',
        description: 'Riwayat tugas, run, hasil, dan persetujuan AI employee',
        icon: ListChecks,
        to: '/tasks',
        status: 'available',
      },
      {
        key: 'missions',
        identity: 'Mission Control',
        label: 'Misi',
        description: 'Misi, XP, dan pencapaian',
        icon: Target,
        status: 'soon',
        release: 'Wave 3',
      },
    ],
  },
  {
    key: 'intelligence',
    label: 'Kecerdasan',
    items: [
      {
        key: 'knowledge',
        identity: 'Knowledge Library',
        label: 'Knowledge',
        description: 'Basis pengetahuan & dokumen',
        icon: BookOpen,
        status: 'soon',
        release: 'Wave 3',
      },
      {
        key: 'integrations',
        identity: 'Tools & Systems',
        label: 'Integrasi',
        description: 'Koneksi ke aplikasi bisnis',
        icon: Plug,
        status: 'soon',
        release: 'Wave 3',
      },
      {
        key: 'analytics',
        identity: 'Intelligence Center',
        label: 'Analitik',
        description: 'Kinerja dan penggunaan AI',
        icon: ChartLine,
        status: 'soon',
        release: 'Wave 3',
      },
    ],
  },
  {
    key: 'business',
    label: 'Bisnis',
    items: [
      {
        key: 'marketplace',
        identity: 'Robot Marketplace',
        label: 'Marketplace',
        description: 'Rekrut AI employee siap pakai',
        icon: Store,
        status: 'soon',
        release: 'Wave 2',
      },
      {
        key: 'billing',
        identity: 'Resources & Subscriptions',
        label: 'Tagihan',
        description: 'Paket, kuota, dan faktur',
        icon: CreditCard,
        status: 'soon',
        release: 'Wave 2',
      },
    ],
  },
]

export const SETTINGS_NAVIGATION: NavigationItem = {
  key: 'settings',
  identity: 'Commander Control Center',
  label: 'Pengaturan',
  description: 'Profil, perusahaan, tampilan, dan sesi',
  icon: Settings,
  to: '/settings',
  status: 'available',
}

/** Semua halaman yang dapat dibuka (untuk pencarian global). */
export function availableNavigation(): NavigationItem[] {
  return [...NAVIGATION.flatMap((group) => group.items), SETTINGS_NAVIGATION].filter(
    (item) => item.status === 'available' && item.to,
  )
}

/** Item navigasi yang aktif untuk path saat ini (termasuk Pengaturan), atau null. */
export function activeNavigation(path: string): NavigationItem | null {
  return (
    [...NAVIGATION.flatMap((group) => group.items), SETTINGS_NAVIGATION].find((item) =>
      isNavigationActive(item, path),
    ) ?? null
  )
}

/** Item aktif bila path sama atau berada di bawahnya (mis. /agents/123). */
export function isNavigationActive(item: NavigationItem, path: string): boolean {
  if (!item.to) return false
  return path === item.to || path.startsWith(`${item.to}/`)
}
