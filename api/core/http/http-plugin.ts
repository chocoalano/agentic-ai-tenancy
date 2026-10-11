import { Elysia, status } from 'elysia'
import type { ApiConfig } from '../config/env'
import { normalizeDatabaseError } from '../database/errors'
import { AppError } from '../errors/app-error'
import type { ApiErrorBody } from '../errors/schemas'
import { checkCrossOrigin } from '../security/cross-origin'
import type { Logger } from './logger'
import { requestIdOf } from './request-context'

/**
 * Endpoint yang tidak menyentuh data tenant dan harus tetap menjawab saat
 * gerbang kesiapan tertutup: health (melaporkan state gerbang) dan dokumentasi
 * OpenAPI. Dicocokkan dari akhir path agar tidak bergantung pada prefix mount.
 */
export function isReadinessExempt(pathname: string): boolean {
  return pathname.endsWith('/v1/health') || /\/openapi(\/|$)/.test(pathname)
}

function body(error: AppError, requestId: string): ApiErrorBody {
  return error.details === undefined
    ? { code: error.code, message: error.message, requestId }
    : { code: error.code, message: error.message, requestId, details: error.details }
}

/**
 * Hook global untuk seluruh API:
 * - request ID (`x-request-id`) untuk korelasi log,
 * - header keamanan dan `Cache-Control: no-store` (respons API dapat berisi
 *   data tenant privat dan tidak boleh disimpan cache bersama),
 * - proteksi CSRF berbasis Fetch Metadata/Origin untuk metode mutasi,
 * - gerbang kesiapan database (fail-closed) sebelum handler mana pun berjalan,
 * - normalisasi semua error menjadi `ApiError`.
 */
export function httpPlugin(deps: { config: ApiConfig; logger: Logger; waitUntilReady?: () => Promise<void> }) {
  return new Elysia()
    .onRequest(async ({ request, set }) => {
      const requestId = requestIdOf(request)
      set.headers['x-request-id'] = requestId
      set.headers['cache-control'] = 'no-store'
      set.headers['x-content-type-options'] = 'nosniff'
      set.headers['referrer-policy'] = 'strict-origin-when-cross-origin'

      const verdict = checkCrossOrigin(request, deps.config.security.trustedOrigins)
      if (!verdict.allowed) {
        deps.logger.warn('Request lintas origin ditolak', { requestId, reason: verdict.reason, method: request.method })
        throw new AppError(403, 'CROSS_ORIGIN_REQUEST_BLOCKED', 'Request lintas origin tidak diizinkan.')
      }
      if (deps.waitUntilReady && !isReadinessExempt(new URL(request.url).pathname)) await deps.waitUntilReady()
    })
    .onError({ as: 'global' }, ({ code, error, request, set }) => {
      const requestId = requestIdOf(request)
      set.headers['x-request-id'] = requestId
      set.headers['cache-control'] = 'no-store'

      if (error instanceof AppError) {
        if (
          (error.status === 429 || error.status === 503) &&
          typeof error.details === 'object' &&
          error.details !== null
        ) {
          const retry = 'retryAfterSeconds' in error.details ? error.details.retryAfterSeconds : undefined
          if (typeof retry === 'number') set.headers['retry-after'] = String(retry)
        }
        return status(error.status, body(error, requestId))
      }

      if (code === 'VALIDATION') {
        // Hanya path dan ringkasan; nilai input (mis. password) tidak pernah dipantulkan.
        const details = error.all.map((issue) => ({
          path: 'path' in issue ? issue.path : '',
          message: issue.summary ?? issue.message,
        }))
        return status(422, {
          code: 'VALIDATION_ERROR',
          message: 'Data yang dikirim tidak valid.',
          requestId,
          details,
        } satisfies ApiErrorBody)
      }

      if (code === 'NOT_FOUND') {
        return status(404, {
          code: 'ROUTE_NOT_FOUND',
          message: 'Endpoint tidak ditemukan.',
          requestId,
        } satisfies ApiErrorBody)
      }

      if (code === 'PARSE') {
        return status(400, {
          code: 'INVALID_BODY',
          message: 'Body request tidak dapat dibaca.',
          requestId,
        } satisfies ApiErrorBody)
      }

      const databaseError = normalizeDatabaseError(error)
      if (databaseError) {
        if (databaseError.status >= 500)
          deps.logger.error('Database tidak tersedia', { requestId, error: String(error) })
        return status(databaseError.status, body(databaseError, requestId))
      }

      deps.logger.error('Error tak terduga', {
        requestId,
        code: String(code),
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      })
      return status(500, {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan pada server.',
        requestId,
      } satisfies ApiErrorBody)
    })
}
