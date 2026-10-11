<script setup lang="ts">
import type { TenantDetail } from '~/utils/api-types'

// Temporary component harness for browser QA; no authentication or database fixtures.
definePageMeta({ layout: 'game', colorMode: 'dark' })
const tenant: TenantDetail = {
  tenant: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'visual-qa',
    name: 'Project Atlas',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  membership: { id: '00000000-0000-4000-8000-000000000002', roles: ['owner'], permissions: [] },
  activeMemberCount: 1,
}
</script>

<template>
  <GameOffice :tenant="tenant" :agents="[]" user-name="Commander" />
</template>
