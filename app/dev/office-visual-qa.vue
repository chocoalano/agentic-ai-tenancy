<script setup lang="ts">
import type { TenantDetail } from '~/utils/api-types'

/*
 * Harness QA visual untuk kalibrasi dunia /office — HANYA mode `nuxt dev`.
 * Didaftarkan oleh modul inline di nuxt.config.ts (`pages:extend`) pada path
 * /__dev/office-visual-qa; file ini berada di luar app/pages sehingga tidak
 * pernah masuk manifest route build production. Tenant di bawah ini adalah
 * fixture harness (bukan akun/tenant nyata) dan tidak memanggil API data tenant.
 */
definePageMeta({ layout: 'game', colorMode: 'dark' })
const tenant: TenantDetail = {
  tenant: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'visual-qa',
    name: 'Harness QA (dev)',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  membership: { id: '00000000-0000-4000-8000-000000000002', roles: ['owner'], permissions: [] },
  activeMemberCount: 1,
}
</script>

<template>
  <GameOffice :tenant="tenant" :agents="[]" user-name="QA" />
</template>
