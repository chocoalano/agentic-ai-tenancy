/**
 * Header internal pembawa alamat IP klien yang DITENTUKAN SERVER.
 *
 * Di mode mount (Nuxt/Nitro), Elysia menerima `Request` tanpa informasi soket,
 * sehingga middleware Nitro (server/middleware/client-ip.ts) menulis header ini
 * dari alamat soket — atau dari `x-forwarded-for` hanya bila TRUSTED_PROXY=true —
 * dan SELALU menimpa nilai apa pun yang dikirim klien. Di mode standalone,
 * Elysia membacanya langsung dari `server.requestIP`.
 */
export const CLIENT_IP_HEADER = 'x-aivo-client-ip'
