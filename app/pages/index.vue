<script setup lang="ts">
import { Bot, Building2, Database, ShieldCheck, Sparkles, Workflow } from '@lucide/vue'

useHead({ title: 'Kantor virtual untuk AI digital employee' })

const pillars = [
  {
    icon: Bot,
    title: 'AI digital employee',
    description: 'Rekrut, konfigurasikan, dan kelola AI employee dengan peran, instruksi, dan izin yang jelas.',
  },
  {
    icon: Building2,
    title: 'Multi-perusahaan',
    description: 'Satu akun untuk banyak perusahaan, dengan peran dan izin berbeda di setiap tenant.',
  },
  {
    icon: ShieldCheck,
    title: 'Isolasi data ketat',
    description: 'Setiap query tenant dijalankan di bawah Row Level Security PostgreSQL.',
  },
  {
    icon: Workflow,
    title: 'Runtime AI yang dapat diganti',
    description: 'Arsitektur orchestrator dan adapter penyedia AI disiapkan untuk fase berikutnya.',
  },
]

const roadmap = [
  { label: 'Fondasi platform, autentikasi, multi-tenancy', status: 'Phase 1 · aktif' },
  { label: 'Robot marketplace, lisensi, dan penugasan tugas', status: 'Wave 2' },
  { label: 'Orchestrator agent, knowledge & memory (pgvector)', status: 'Wave 3' },
]
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
    <section class="flex flex-col items-center gap-6 pb-16 pt-12 text-center sm:pt-20">
      <Badge variant="outline" class="glass gap-1.5 px-3 py-1 text-xs">
        <Sparkles class="size-3.5 text-brand-cyan" aria-hidden="true" />
        Phase 1 — fondasi platform
      </Badge>
      <h1 class="max-w-3xl font-heading text-4xl font-semibold leading-tight sm:text-6xl">
        Kantor virtual untuk <span class="text-gradient-brand">AI digital employee</span> perusahaan Anda
      </h1>
      <p class="max-w-2xl text-base text-muted-foreground sm:text-lg">
        Kelola tim AI yang bekerja bersama tim manusia — dengan identitas, izin, dan batas data yang jelas untuk setiap
        perusahaan.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <Button as-child size="lg"><NuxtLink to="/register">Mulai sekarang</NuxtLink></Button>
        <Button as-child size="lg" variant="outline" class="glass"><NuxtLink to="/login">Masuk</NuxtLink></Button>
      </div>
    </section>

    <section aria-labelledby="pilar" class="space-y-6">
      <h2 id="pilar" class="sr-only">Kemampuan utama</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card v-for="pillar in pillars" :key="pillar.title" class="glass gap-3 py-5">
          <CardHeader class="px-5">
            <span
              class="mb-2 grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-blue/25 to-brand-purple/20 text-brand-cyan"
              aria-hidden="true"
            >
              <component :is="pillar.icon" class="size-5" />
            </span>
            <CardTitle class="font-heading text-base">{{ pillar.title }}</CardTitle>
          </CardHeader>
          <CardContent class="px-5 text-sm text-muted-foreground">{{ pillar.description }}</CardContent>
        </Card>
      </div>
    </section>

    <section aria-labelledby="peta-jalan" class="mt-16">
      <Card class="glass">
        <CardHeader>
          <CardTitle id="peta-jalan" class="flex items-center gap-2 font-heading">
            <Database class="size-4 text-brand-cyan" aria-hidden="true" />
            Peta jalan
          </CardTitle>
          <CardDescription>Cakupan yang sudah dan akan dibangun.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul class="divide-y divide-glass-border">
            <li
              v-for="item in roadmap"
              :key="item.label"
              class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span class="text-sm">{{ item.label }}</span>
              <Badge variant="secondary">{{ item.status }}</Badge>
            </li>
          </ul>
        </CardContent>
      </Card>
    </section>
  </div>
</template>
