<script setup lang="ts">
import { Laptop, Moon, Sun } from '@lucide/vue'

const colorMode = useColorMode()

const options = [
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'system', label: 'Ikuti sistem', icon: Laptop },
] as const
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="size-10 rounded-xl md:size-9" aria-label="Ganti tema tampilan">
        <Moon class="size-4 dark:hidden" aria-hidden="true" />
        <Sun class="hidden size-4 dark:block" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-44">
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        :data-active="colorMode.preference === option.value || undefined"
        class="data-[active]:text-primary"
        @select="colorMode.preference = option.value"
      >
        <component :is="option.icon" class="size-4" aria-hidden="true" />
        {{ option.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
