import type { ApiErrorBody } from '~~/api/core/errors/schemas'

export interface ApiErrorInfo {
  status: number
  code: string
  message: string
  requestId?: string
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  )
}

/**
 * Menormalkan `error` dari respons Eden Treaty (`{ status, value }`) menjadi
 * informasi yang aman ditampilkan. Error jaringan/tak dikenal tetap menghasilkan
 * pesan generik.
 */
export function toApiErrorInfo(error: { status: unknown; value: unknown }): ApiErrorInfo {
  const status = typeof error.status === 'number' ? error.status : 0
  if (isApiErrorBody(error.value)) {
    return {
      status,
      code: error.value.code,
      message: error.value.message,
      ...(error.value.requestId ? { requestId: error.value.requestId } : {}),
    }
  }
  return { status, code: 'NETWORK_ERROR', message: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.' }
}

/** `ApiErrorInfo` dari error yang dibuat `apiFailure` (atau null bila bukan). */
export function apiErrorInfoOf(error: unknown): ApiErrorInfo | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null
  const data = error.data
  if (typeof data !== 'object' || data === null) return null
  if (!('status' in data) || !('code' in data) || !('message' in data)) return null
  if (typeof data.status !== 'number' || typeof data.code !== 'string' || typeof data.message !== 'string') return null
  return { status: data.status, code: data.code, message: data.message }
}

/** Kode ApiError dari error yang dibuat `apiFailure` (atau null bila bukan). */
export function apiErrorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null
  const data = error.data
  return typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string' ? data.code : null
}

/** Membuat NuxtError dari error API agar dapat dilempar di dalam useAsyncData. */
export function apiFailure(error: { status: unknown; value: unknown }) {
  const info = toApiErrorInfo(error)
  return createError({
    statusCode: info.status || 500,
    statusMessage: info.code,
    message: info.message,
    data: info,
  })
}
