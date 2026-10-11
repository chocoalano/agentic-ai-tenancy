<script setup lang="ts">
import { v2Source, visibleSize, type GameAsset } from '~/utils/game-assets'

/**
 * Merender satu aset dari registry (`~/utils/game-assets`).
 *
 * - Kotak elemen = area terlihat setelah `crop`, sehingga tata letak memakai
 *   ukuran artwork bersih.
 * - Bila tersedia (dan `v2` tidak dimatikan), dipakai aset v2 yang sudah
 *   dikliping & diperbaiki (`/game-assets-v2/...`, WebP alpha — termasuk fx
 *   dengan alpha sungguhan); selain itu file asli dengan kliping CSS (fx asli:
 *   mask luminans). File asli tidak pernah diubah.
 * - Dekoratif secara default (`alt=""`); isi `alt` bila gambar bermakna.
 * - Lebar diatur pemanggil (kelas/gaya); tinggi mengikuti rasio aset.
 */
const props = withDefaults(
  defineProps<{
    asset: GameAsset
    alt?: string
    /** true untuk artwork di atas lipatan (scene utama). */
    eager?: boolean
    /** false = paksa file asli (mis. galeri perbandingan). */
    v2?: boolean
    imgClass?: string
  }>(),
  { alt: '', eager: false, v2: true, imgClass: undefined },
)

const visible = computed(() => visibleSize(props.asset, props.v2))
const frameStyle = computed(() => ({ aspectRatio: `${visible.value.width} / ${visible.value.height}` }))
const v2Image = computed(() => (props.v2 ? v2Source(props.asset) : undefined))

const imageStyle = computed(() => {
  const inset = props.asset.crop
  if (v2Image.value || !inset) return undefined
  return {
    width: `${(props.asset.width / visible.value.width) * 100}%`,
    maxWidth: 'none',
    left: `${(-inset.left / visible.value.width) * 100}%`,
    top: `${(-inset.top / visible.value.height) * 100}%`,
  }
})

const luminanceStyle = computed(() => {
  const url = `url("${props.asset.src}")`
  return { backgroundImage: url, maskImage: url, WebkitMaskImage: url }
})
</script>

<template>
  <span class="relative block overflow-hidden" :style="frameStyle">
    <img
      v-if="v2Image"
      :src="v2Image.src"
      :alt="alt"
      :width="v2Image.width"
      :height="v2Image.height"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      draggable="false"
      :data-asset="asset.id"
      data-v2="true"
      :class="['pointer-events-none absolute inset-0 size-full select-none', imgClass]"
    />
    <span
      v-else-if="asset.render === 'luminance'"
      class="fx-luminance absolute inset-0"
      :style="luminanceStyle"
      :data-asset="asset.id"
      aria-hidden="true"
    />
    <img
      v-else
      :src="asset.src"
      :alt="alt"
      :width="asset.width"
      :height="asset.height"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      draggable="false"
      :data-asset="asset.id"
      :class="[
        'pointer-events-none absolute select-none',
        asset.crop ? 'h-auto' : 'inset-0 size-full object-contain',
        imgClass,
      ]"
      :style="imageStyle"
    />
  </span>
</template>
