/*
 * Sinkronisasi state autentikasi antar-tab (BroadcastChannel).
 *
 * Tenant aktif disimpan di SESI SERVER dan dibagi semua tab, sedangkan state
 * frontend (`useAuth`) hidup per tab. Saat satu tab login, ganti tenant, atau
 * logout, tab lain diberi tahu agar memuat ulang konteks dari backend
 * (server tetap satu-satunya sumber kebenaran; pesan ini hanya pemicu, bukan
 * data yang dipercaya). Tanpa BroadcastChannel (browser lama/SSR) fungsi ini
 * tidak melakukan apa-apa; lapisan lain (header x-active-tenant, revalidasi
 * saat tab fokus, event SSE `ready`) tetap menjaga konsistensi.
 */

export const AUTH_SYNC_CHANNEL = 'aivo-auth-sync'

export type AuthSyncMessage =
  { type: 'session-changed'; activeTenantId: string | null; userId: string | null } | { type: 'logged-out' }

function isAuthSyncMessage(value: unknown): value is AuthSyncMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  if (value.type === 'logged-out') return true
  return (
    value.type === 'session-changed' &&
    'activeTenantId' in value &&
    (typeof value.activeTenantId === 'string' || value.activeTenantId === null) &&
    'userId' in value &&
    (typeof value.userId === 'string' || value.userId === null)
  )
}

function openChannel(): BroadcastChannel | null {
  if (import.meta.server || typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(AUTH_SYNC_CHANNEL)
  } catch {
    return null
  }
}

/** Kirim pemberitahuan ke tab lain (tab pengirim tidak menerima pesannya sendiri). */
export function postAuthSync(message: AuthSyncMessage): void {
  const channel = openChannel()
  if (!channel) return
  channel.postMessage(message)
  channel.close()
}

/** Dengarkan pemberitahuan dari tab lain; mengembalikan fungsi untuk berhenti. */
export function onAuthSync(handler: (message: AuthSyncMessage) => void): () => void {
  const channel = openChannel()
  if (!channel) return () => {}
  const listener = (event: MessageEvent<unknown>) => {
    if (isAuthSyncMessage(event.data)) handler(event.data)
  }
  channel.addEventListener('message', listener)
  return () => {
    channel.removeEventListener('message', listener)
    channel.close()
  }
}
