-- 0004_sessions: sesi login berbasis database.
--
-- Token sesi tidak pernah disimpan mentah: kolom token_hash berisi
-- HMAC-SHA256(SESSION_SECRET, token). Kebocoran isi tabel tidak memberikan
-- token yang dapat dipakai.
--
-- active_tenant_id hanyalah preferensi pilihan tenant. Setiap request
-- tenant-scoped tetap memverifikasi keanggotaan aktif di database.

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null,
  active_tenant_id uuid references tenants (id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint sessions_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint sessions_expiry_after_creation check (expires_at > created_at),
  constraint sessions_user_agent_length check (user_agent is null or char_length(user_agent) <= 512)
);

create unique index sessions_token_hash_key on sessions (token_hash);
create index sessions_user_active_idx on sessions (user_id) where revoked_at is null;
create index sessions_expires_at_idx on sessions (expires_at);

grant select, insert, update, delete on sessions to agentic_runtime;
