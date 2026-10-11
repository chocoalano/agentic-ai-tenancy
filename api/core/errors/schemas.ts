import { t } from 'elysia'

/** Bentuk standar error API: `{ code, message, requestId?, details? }`. */
export const ApiErrorSchema = t.Object(
  {
    code: t.String({ description: 'Kode error stabil yang dapat diproses mesin, mis. UNAUTHENTICATED' }),
    message: t.String({ description: 'Pesan yang aman ditampilkan ke pengguna' }),
    requestId: t.Optional(t.String({ description: 'ID korelasi request (juga ada di header x-request-id)' })),
    details: t.Optional(t.Unknown({ description: 'Detail tambahan, mis. daftar field yang tidak valid' })),
  },
  { title: 'ApiError' },
)

export type ApiErrorBody = typeof ApiErrorSchema.static

/*
 * Kombinasi schema error yang dipakai berulang. Mendeklarasikan status error
 * di `response` membuat Eden Treaty mengetahui tipe `error.value` per status.
 *
 * JANGAN memakai `as const` pada objek ini: saat di-spread ke `response`,
 * kunci numerik berubah menjadi string ("401") dan merusak tipe status Eden.
 */
export const validationErrors = { 422: ApiErrorSchema }
/** Route terlindungi: 401 bila sesi tidak valid, 403 bila izin/keanggotaan/CSRF ditolak. */
export const protectedErrors = { 401: ApiErrorSchema, 403: ApiErrorSchema }
