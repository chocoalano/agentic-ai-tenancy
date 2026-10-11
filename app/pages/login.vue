<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { CircleAlert, Loader2 } from '@lucide/vue'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import { PASSWORD_MAX_LENGTH } from '~~/domains/auth/password-policy'

definePageMeta({ middleware: 'guest' })
useHead({ title: 'Masuk' })

const route = useRoute()
const auth = useAuth()
const failure = ref<string | null>(null)

const form = useForm({
  validationSchema: toTypedSchema(
    z.object({
      email: z.string({ required_error: 'Email wajib diisi' }).trim().email('Format email tidak valid'),
      password: z
        .string({ required_error: 'Kata sandi wajib diisi' })
        .min(1, 'Kata sandi wajib diisi')
        .max(PASSWORD_MAX_LENGTH),
    }),
  ),
})

const onSubmit = form.handleSubmit(async (values) => {
  failure.value = null
  const error = await auth.login(values)
  if (error) {
    failure.value = error.message
    return
  }
  await navigateTo(safeRedirectPath(route.query.redirect))
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-20">
    <Card class="glass holo-glow">
      <CardHeader class="space-y-1">
        <CardTitle class="font-heading text-2xl">Masuk</CardTitle>
        <CardDescription>Masuk untuk membuka kantor virtual perusahaan Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <Alert v-if="failure" variant="destructive" role="alert">
            <CircleAlert class="size-4" aria-hidden="true" />
            <AlertTitle>Gagal masuk</AlertTitle>
            <AlertDescription>{{ failure }}</AlertDescription>
          </Alert>
          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autocomplete="email" placeholder="nama@perusahaan.com" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField v-slot="{ componentField }" name="password">
            <FormItem>
              <FormLabel>Kata sandi</FormLabel>
              <FormControl>
                <Input type="password" autocomplete="current-password" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <Button type="submit" class="w-full" :disabled="form.isSubmitting.value">
            <Loader2 v-if="form.isSubmitting.value" class="size-4 animate-spin" aria-hidden="true" />
            Masuk
          </Button>
        </form>
      </CardContent>
      <CardFooter class="justify-center text-sm text-muted-foreground">
        Belum punya akun?&nbsp;<NuxtLink to="/register" class="font-medium text-primary hover:underline"
          >Daftar</NuxtLink
        >
      </CardFooter>
    </Card>
  </div>
</template>
