/**
 * Error aplikasi yang aman dikirim ke klien. Semua error yang diharapkan
 * (validasi bisnis, otorisasi, tidak ditemukan) dilempar sebagai AppError;
 * error lain dianggap tak terduga dan dinormalisasi menjadi 500 tanpa detail.
 */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503

export class AppError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const errors = {
  unauthenticated: (message = 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.') =>
    new AppError(401, 'UNAUTHENTICATED', message),
  forbidden: (code: string, message: string) => new AppError(403, code, message),
  notFound: (code: string, message: string) => new AppError(404, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  tooManyRequests: (message: string, details?: unknown) => new AppError(429, 'TOO_MANY_REQUESTS', message, details),
}
