import { defineVitestConfig } from '@nuxt/test-utils/config'

/**
 * Test komponen/composable Nuxt (lingkungan `nuxt` + happy-dom).
 * Test backend memakai Bun Test (lihat bunfig.toml dan tests/{unit,integration,security,e2e}).
 */
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['tests/nuxt/**/*.test.ts'],
    environmentOptions: {
      nuxt: {
        domEnvironment: 'happy-dom',
      },
    },
  },
})
