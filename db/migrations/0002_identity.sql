-- 0002_identity: identitas manusia (global, bukan tenant-scoped).
--
-- Tabel users tidak memakai RLS tenant karena satu pengguna dapat menjadi
-- anggota banyak tenant. Akses hanya melalui repository auth/users.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  password_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'disabled')),
  constraint users_email_normalized check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  constraint users_display_name_length check (char_length(btrim(display_name)) between 1 and 120)
);

create unique index users_email_key on users (email);

create trigger users_touch_updated_at
before update on users
for each row execute function app.touch_updated_at();

grant select, insert, update on users to agentic_runtime;
