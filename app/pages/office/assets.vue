<script setup lang="ts">
import { ArrowLeft, FlaskConical } from '@lucide/vue'
import {
  BACKGROUNDS,
  CHARACTER_KEYS,
  CHARACTER_STATE_KEYS,
  CHARACTER_STATES,
  CHARACTERS,
  FX,
  FX_KEYS,
  ICON_KEYS,
  ICONS,
  ISLAND_KEYS,
  ISLANDS,
  TILE_KEYS,
  TILES,
  UI_PREVIEWS,
} from '~/utils/game-assets'

/*
 * Galeri aset game — PRATINJAU DESAIN, terpisah dari data perusahaan.
 * Menampilkan kelima karakter robot, pose, pulau, terrain, efek, ikon, dan
 * referensi gaya UI langsung dari registry (`~/utils/game-assets`). Tidak ada
 * AI employee yang dikarang di sini: nama Nova/Sage/Pixel/Bolt/Echo adalah
 * nama karakter asset pack, bukan agent.
 */
definePageMeta({ layout: 'app', middleware: 'auth', title: 'Galeri Aset Game' })
useHead({ title: 'Galeri Aset Game' })

const uiPreviews = Object.entries(UI_PREVIEWS)
</script>

<template>
  <div class="space-y-6">
    <Button variant="ghost" size="sm" as-child class="-ml-2">
      <NuxtLink to="/office"><ArrowLeft class="size-4" aria-hidden="true" />Kembali ke Virtual Office</NuxtLink>
    </Button>

    <PageHeader
      eyebrow="Pratinjau desain"
      title="Galeri Aset Game"
      description="Aset dari asset pack Neon Mission Map yang dipakai Virtual Office (varian HD turunan ditampilkan bila tersedia). Halaman ini bukan data perusahaan."
    >
      <template #actions>
        <Badge variant="outline" class="gap-1 border-dashed">
          <FlaskConical class="size-3" aria-hidden="true" />
          Pratinjau desain
        </Badge>
      </template>
    </PageHeader>

    <Alert class="glass">
      <FlaskConical class="size-4" aria-hidden="true" />
      <AlertTitle>Bukan AI employee nyata</AlertTitle>
      <AlertDescription>
        Nova, Sage, Pixel, Bolt, dan Echo adalah karakter visual. Di Virtual Office, setiap AI employee perusahaan
        dipetakan ke salah satu karakter berdasarkan arketipe perannya — nama dan identitas agent tidak diubah.
      </AlertDescription>
    </Alert>

    <div class="office-frame dark space-y-8 rounded-2xl border border-office-border/50 p-4 text-foreground sm:p-6">
      <section aria-labelledby="gallery-characters">
        <h2 id="gallery-characters" class="type-section-title">Karakter robot</h2>
        <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <li
            v-for="key in CHARACTER_KEYS"
            :key="key"
            class="office-panel flex flex-col items-center gap-2 rounded-2xl p-4"
          >
            <AgentSprite :character="key" :alt="`Karakter robot ${CHARACTERS[key].name}`" class="w-[84px]" eager />
            <p class="font-heading font-semibold">{{ CHARACTERS[key].name }}</p>
            <p class="text-xs text-office-cyan">{{ CHARACTERS[key].archetype }}</p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="gallery-states">
        <h2 id="gallery-states" class="type-section-title">Pose aktivitas</h2>
        <p class="type-support text-xs">
          Dipakai sebagai ilustrasi fungsi stasiun dan (kelak) status runtime dari orchestrator.
        </p>
        <ul class="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
          <li
            v-for="key in CHARACTER_STATE_KEYS"
            :key="key"
            class="office-well flex flex-col items-center gap-1.5 rounded-xl p-2"
          >
            <GameImage :asset="CHARACTER_STATES[key]" :alt="`Pose ${CHARACTER_STATES[key].label}`" class="w-16" />
            <p class="text-xs">{{ CHARACTER_STATES[key].label }}</p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="gallery-islands">
        <h2 id="gallery-islands" class="type-section-title">Pulau & workstation</h2>
        <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <li v-for="key in ISLAND_KEYS" :key="key" class="office-well flex flex-col items-center gap-2 rounded-xl p-3">
            <GameImage :asset="ISLANDS[key]" :alt="`Pulau ${key}`" class="w-full max-w-[150px]" />
            <code class="text-[11px] text-muted-foreground">{{ ISLANDS[key].id }}</code>
          </li>
        </ul>
      </section>

      <section aria-labelledby="gallery-environment">
        <h2 id="gallery-environment" class="type-section-title">Lingkungan & efek</h2>
        <ul class="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          <li v-for="key in TILE_KEYS" :key="key" class="office-well flex flex-col items-center gap-1.5 rounded-xl p-2">
            <GameImage :asset="TILES[key]" :alt="`Terrain ${key}`" class="w-14" />
            <code class="text-[10px] text-muted-foreground">{{ key }}</code>
          </li>
        </ul>
        <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <li v-for="key in FX_KEYS" :key="key" class="office-well flex flex-col items-center gap-1.5 rounded-xl p-2">
            <GameImage :asset="FX[key]" class="w-16" />
            <code class="text-[10px] text-muted-foreground">{{ key }}</code>
          </li>
        </ul>
        <figure class="office-well mt-3 rounded-xl p-3">
          <GameImage :asset="BACKGROUNDS['city-skyline']" alt="Latar kota futuristik" class="w-full max-w-[634px]" />
          <figcaption class="mt-2 text-xs text-muted-foreground">
            backgrounds/city-skyline.png — 317×125 px (ditampilkan maksimal 2×; perlu render ulang resolusi tinggi).
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="gallery-icons">
        <h2 id="gallery-icons" class="type-section-title">Ikon</h2>
        <ul class="mt-3 grid grid-cols-5 gap-3 sm:grid-cols-10">
          <li v-for="key in ICON_KEYS" :key="key" class="flex flex-col items-center gap-1">
            <GameImage :asset="ICONS[key]" :alt="`Ikon ${key}`" class="w-11 rounded-lg" />
            <code class="text-[10px] text-muted-foreground">{{ key }}</code>
          </li>
        </ul>
      </section>

      <section aria-labelledby="gallery-ui">
        <h2 id="gallery-ui" class="type-section-title">Referensi gaya UI (gambar statis)</h2>
        <p class="type-support text-xs">
          Berisi teks tercetak — hanya acuan gaya. Panel nyata di Virtual Office dibuat dengan Vue + shadcn-vue.
        </p>
        <ul class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="[key, item] in uiPreviews" :key="key" class="office-well rounded-xl p-2">
            <GameImage :asset="item" :alt="`Referensi gaya ${key}`" class="w-full" />
            <code class="mt-1 block text-[10px] text-muted-foreground">{{ item.id }}</code>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
