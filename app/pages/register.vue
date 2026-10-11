<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { CircleAlert, Loader2 } from '@lucide/vue'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '~~/domains/auth/password-policy'

definePageMeta({ middleware: 'guest' })
useHead({ title: 'Daftar' })

const auth = useAuth()
const failure = ref<string | null>(null)

const form = useForm({
  validationSchema: toTypedSchema(
    z.object({
      displayName: z.string({ required_error: 'Nama wajib diisi' }).trim().min(1, 'Nama wajib diisi').max(120),
      email: z.string({ required_error: 'Email wajib diisi' }).trim().email('Format email tidak valid'),
      password: z
        .string({ required_error: 'Kata sandi wajib diisi' })
        .min(PASSWORD_MIN_LENGTH, `Minimal ${PASSWORD_MIN_LENGTH} karakter`)
        .max(PASSWORD_MAX_LENGTH, `Maksimal ${PASSWORD_MAX_LENGTH} karakter`),
      companyName: z
        .string()
        .trim()
        .max(120)
        .refine((value) => value.length === 0 || value.length >= 2, 'Minimal 2 karakter')
        .optional(),
    }),
  ),
})

const onSubmit = form.handleSubmit(async (values) => {
  failure.value = null
  const error = await auth.register({
    displayName: values.displayName,
    email: values.email,
    password: values.password,
    ...(values.companyName ? { companyName: values.companyName } : {}),
  })
  if (error) {
    failure.value = error.message
    return
  }
  await navigateTo('/office')
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
    <Card class="glass holo-glow">
      <CardHeader class="space-y-1">
        <CardTitle class="font-heading text-2xl">Buat akun</CardTitle>
        <CardDescription>Daftar dan, bila perlu, langsung buat perusahaan pertama Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <Alert v-if="failure" variant="destructive" role="alert">
            <CircleAlert class="size-4" aria-hidden="true" />
            <AlertTitle>Pendaftaran gagal</AlertTitle>
            <AlertDescription>{{ failure }}</AlertDescription>
          </Alert>
          <FormField v-slot="{ componentField }" name="displayName">
            <FormItem>
              <FormLabel>Nama lengkap</FormLabel>
              <FormControl><Input autocomplete="name" v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>Email kerja</FormLabel>
              <FormControl><Input type="email" autocomplete="email" v-bind="componentField" /></FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="password">
            <FormItem>
              <FormLabel>Kata sandi</FormLabel>
              <FormControl><Input type="password" autocomplete="new-password" v-bind="componentField" /></FormControl>
              <FormDescription>Minimal {{ PASSWORD_MIN_LENGTH }} karakter.</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="companyName">
            <FormItem>
              <FormLabel>Nama perusahaan <span class="text-muted-foreground">(opsional)</span></FormLabel>
              <FormControl><Input autocomplete="organization" v-bind="componentField" /></FormControl>
              <FormDescription>Anda akan menjadi pemilik (owner) perusahaan ini.</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
          <Button type="submit" class="w-full" :disabled="form.isSubmitting.value">
            <Loader2 v-if="form.isSubmitting.value" class="size-4 animate-spin" aria-hidden="true" />
            Daftar
          </Button>
        </form>
      </CardContent>
      <CardFooter class="justify-center text-sm text-muted-foreground">
        Sudah punya akun?&nbsp;<NuxtLink to="/login" class="font-medium text-primary hover:underline">Masuk</NuxtLink>
      </CardFooter>
    </Card>
  </div>
</template>
