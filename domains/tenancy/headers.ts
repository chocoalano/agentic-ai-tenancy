/**
 * Header konsistensi tenant antara tab browser dan sesi server.
 *
 * Tenant aktif hidup di sesi server (dibagi semua tab). Tab mengirim tenant
 * yang DIKIRA aktif lewat `x-active-tenant`; server menolak 409
 * `TENANT_MISMATCH` bila berbeda dari sesi, sehingga data tenant lain tidak
 * pernah masuk ke cache tab yang usang. Header ini bukan sumber identitas —
 * identitas dan tenant selalu berasal dari cookie sesi + database.
 * `x-tenant-id` pada respons menyatakan tenant yang benar-benar dipakai.
 */
export const ACTIVE_TENANT_HEADER = 'x-active-tenant'
export const TENANT_ID_HEADER = 'x-tenant-id'
export const TENANT_MISMATCH_CODE = 'TENANT_MISMATCH'
