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
        label: 'Virtual Office',
        description: 'Lantai kantor dan ringkasan operasional',
        icon: Building2,
        to: '/office',
        status: 'available',
      },
      {
        key: 'agents',
        label: 'AI Employees',
        description: 'Direktori AI employee perusahaan',
        icon: Bot,
        to: '/agents',
        status: 'available',
      },
      {
        key: 'tasks',
        label: 'Tugas',
        description: 'Penugasan, run, dan persetujuan',
        icon: ListChecks,
        status: 'soon',
        release: 'Wave 2',
      },
      {
        key: 'missions',
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
        label: 'Knowledge',
        description: 'Basis pengetahuan & dokumen',
        icon: BookOpen,
        status: 'soon',
        release: 'Wave 3',
      },
      {
        key: 'integrations',
        label: 'Integrasi',
        description: 'Koneksi ke aplikasi bisnis',
        icon: Plug,
        status: 'soon',
        release: 'Wave 3',
      },
      {
        key: 'analytics',
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
        label: 'Marketplace',
        description: 'Rekrut AI employee siap pakai',
        icon: Store,
        status: 'soon',
        release: 'Wave 2',
      },
      {
        key: 'billing',
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

/** Item aktif bila path sama atau berada di bawahnya (mis. /agents/123). */
export function isNavigationActive(item: NavigationItem, path: string): boolean {
  if (!item.to) return false
  return path === item.to || path.startsWith(`${item.to}/`)
}
