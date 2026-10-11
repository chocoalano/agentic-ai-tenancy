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
