/**
 * Preferensi antarmuka pengguna yang disimpan di cookie (aman untuk SSR —
 * tidak ada kedipan saat hidrasi). Saat ini: preferensi gerakan.
 *
 * - `motion: 'system'`  → ikuti `prefers-reduced-motion` sistem operasi (default).
 * - `motion: 'reduced'` → paksa kurangi animasi: CSS global
 *   (`html[data-motion="reduced"]`, lihat tailwind.css) dan mesin game
 *   (`engine.reducedMotion`, lihat useOfficeEngine).
 *
 * Tema warna tetap dikelola @nuxtjs/color-mode (`useColorMode`).
 */
export const MOTION_PREFERENCES = ['system', 'reduced'] as const
export type MotionPreference = (typeof MOTION_PREFERENCES)[number]
export const MOTION_COOKIE = 'aivo-motion'

export function isMotionPreference(value: unknown): value is MotionPreference {
  return typeof value === 'string' && (MOTION_PREFERENCES as readonly string[]).includes(value)
}

export function useUiPreferences() {
  const motion = useCookie<MotionPreference>(MOTION_COOKIE, {
    default: () => 'system',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    decode: (value) => (isMotionPreference(value) ? value : 'system'),
  })
  const reducedMotion = computed(() => motion.value === 'reduced')

  function setMotion(value: MotionPreference): void {
    motion.value = value
  }

  return { motion, reducedMotion, setMotion }
}
