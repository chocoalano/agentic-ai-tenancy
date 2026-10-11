-- 0003_tenancy: tenant, keanggotaan, peran, izin, dan Row Level Security.
--
-- Model: shared database, shared schema, kolom tenant_id wajib untuk data
-- tenant-scoped. Isolasi ditegakkan oleh RLS dengan FORCE ROW LEVEL SECURITY
-- sehingga pemilik tabel pun tunduk pada kebijakan.
--
-- Konteks yang dibaca kebijakan:
--   app.current_tenant_id()  -> tenant terpilih yang sudah diverifikasi
--   app.current_user_id()    -> pengguna terautentikasi

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status text not null default 'active',
  created_by_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_status_check check (status in ('active', 'suspended')),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$'),
  constraint tenants_name_length check (char_length(btrim(name)) between 2 and 120)
);

create unique index tenants_slug_key on tenants (slug);

create trigger tenants_touch_updated_at
before update on tenants
for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant memberships
-- ---------------------------------------------------------------------------
create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_status_check check (status in ('invited', 'active', 'suspended')),
  constraint tenant_memberships_tenant_user_key unique (tenant_id, user_id),
  constraint tenant_memberships_id_tenant_key unique (id, tenant_id)
);

create index tenant_memberships_user_idx on tenant_memberships (user_id);

create trigger tenant_memberships_touch_updated_at
before update on tenant_memberships
for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Permissions (katalog global, referensi untuk semua tenant)
-- ---------------------------------------------------------------------------
create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint permissions_key_format check (key ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$')
);

create unique index permissions_key_key on permissions (key);

-- ---------------------------------------------------------------------------
-- Roles: peran sistem (tenant_id NULL, read-only bagi aplikasi) dan peran
-- kustom milik tenant.
-- ---------------------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  constraint roles_scope_check check ((is_system and tenant_id is null) or (not is_system and tenant_id is not null))
);

create unique index roles_system_key on roles (key) where tenant_id is null;
create unique index roles_tenant_key on roles (tenant_id, key) where tenant_id is not null;

create trigger roles_touch_updated_at
before update on roles
for each row execute function app.touch_updated_at();

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on role_permissions (permission_id);

create table membership_roles (
  membership_id uuid not null,
  tenant_id uuid not null,
  role_id uuid not null references roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, role_id),
  constraint membership_roles_membership_fk
    foreign key (membership_id, tenant_id) references tenant_memberships (id, tenant_id) on delete cascade
);

create index membership_roles_tenant_idx on membership_roles (tenant_id);
create index membership_roles_role_idx on membership_roles (role_id);

-- Peran yang ditautkan harus peran sistem atau milik tenant yang sama.
-- Dipakai trigger (bukan hanya RLS) agar berlaku untuk semua role database.
-- Peran kustom tenant lain tidak terlihat karena RLS, sehingga ikut ditolak.
create or replace function app.ensure_membership_role_tenant() returns trigger
language plpgsql
as $$
declare
  role_tenant uuid;
  role_found boolean;
begin
  select true, r.tenant_id into role_found, role_tenant from public.roles r where r.id = new.role_id;
  if not coalesce(role_found, false) then
    raise exception 'Peran % tidak ditemukan', new.role_id using errcode = '23503';
  end if;
  if role_tenant is not null and role_tenant <> new.tenant_id then
    raise exception 'Peran tidak berada pada tenant yang sama dengan keanggotaan' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function app.ensure_membership_role_tenant() from public;

create trigger membership_roles_tenant_guard
before insert or update on membership_roles
for each row execute function app.ensure_membership_role_tenant();

-- ---------------------------------------------------------------------------
-- Data referensi: katalog izin dan peran sistem (ditulis sebelum RLS aktif).
-- Data ini adalah kontrak produk (berlaku di semua environment), bukan data
-- seed pengembangan. Pemetaan peran → izin disimpan di database sehingga
-- tidak ada izin yang di-hardcode di kode aplikasi.
-- ---------------------------------------------------------------------------
insert into permissions (key, description) values
  ('tenant.read', 'Melihat profil perusahaan'),
  ('tenant.manage', 'Mengubah profil dan pengaturan perusahaan'),
  ('members.read', 'Melihat anggota perusahaan'),
  ('members.manage', 'Mengundang anggota dan mengatur peran'),
  ('agents.read', 'Melihat AI digital employee'),
  ('agents.manage', 'Membuat dan mengonfigurasi AI digital employee');

insert into roles (key, name, description, is_system) values
  ('owner', 'Pemilik', 'Akses penuh ke perusahaan', true),
  ('admin', 'Administrator', 'Mengelola anggota dan AI employee', true),
  ('member', 'Anggota', 'Bekerja bersama AI employee', true),
  ('viewer', 'Pengamat', 'Akses baca saja', true);

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on (
  (r.key = 'owner')
  or (r.key = 'admin' and p.key <> 'tenant.manage')
  or (r.key = 'member' and p.key in ('tenant.read', 'members.read', 'agents.read'))
  or (r.key = 'viewer' and p.key in ('tenant.read', 'agents.read'))
)
where r.tenant_id is null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table tenants enable row level security;
alter table tenants force row level security;
alter table tenant_memberships enable row level security;
alter table tenant_memberships force row level security;
alter table roles enable row level security;
alter table roles force row level security;
alter table role_permissions enable row level security;
alter table role_permissions force row level security;
alter table membership_roles enable row level security;
alter table membership_roles force row level security;

-- Keanggotaan: pengguna melihat keanggotaannya sendiri di semua tenant;
-- dalam konteks tenant, seluruh keanggotaan tenant tersebut terlihat.
-- Penulisan hanya di dalam konteks tenant yang aktif.
create policy tenant_memberships_select on tenant_memberships
  for select using (tenant_id = app.current_tenant_id() or user_id = app.current_user_id());
create policy tenant_memberships_insert on tenant_memberships
  for insert with check (tenant_id = app.current_tenant_id());
create policy tenant_memberships_update on tenant_memberships
  for update using (tenant_id = app.current_tenant_id()) with check (tenant_id = app.current_tenant_id());
create policy tenant_memberships_delete on tenant_memberships
  for delete using (tenant_id = app.current_tenant_id());

-- Tenant terlihat bila sedang menjadi konteks aktif atau pengguna adalah
-- anggota aktif. Pembuatan tenant hanya untuk ID konteks yang sedang dibuat
-- dan oleh pengguna yang sedang login.
create policy tenants_select on tenants
  for select using (
    id = app.current_tenant_id()
    or exists (
      select 1 from tenant_memberships m
      where m.tenant_id = tenants.id
        and m.user_id = app.current_user_id()
        and m.status = 'active'
    )
  );
create policy tenants_insert on tenants
  for insert with check (id = app.current_tenant_id() and created_by_user_id = app.current_user_id());
create policy tenants_update on tenants
  for update using (id = app.current_tenant_id()) with check (id = app.current_tenant_id());

-- Peran sistem terlihat oleh semua; peran kustom hanya oleh tenant pemiliknya.
create policy roles_select on roles
  for select using (
    tenant_id is null
    or tenant_id = app.current_tenant_id()
    or exists (
      select 1 from tenant_memberships m
      where m.tenant_id = roles.tenant_id
        and m.user_id = app.current_user_id()
        and m.status = 'active'
    )
  );
create policy roles_insert on roles
  for insert with check (tenant_id = app.current_tenant_id() and not is_system);
create policy roles_update on roles
  for update using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id() and not is_system);
create policy roles_delete on roles
  for delete using (tenant_id = app.current_tenant_id());

-- Pemetaan peran-izin mengikuti visibilitas peran; hanya peran kustom tenant
-- aktif yang dapat diubah.
create policy role_permissions_select on role_permissions
  for select using (exists (select 1 from roles r where r.id = role_permissions.role_id));
create policy role_permissions_insert on role_permissions
  for insert with check (
    exists (select 1 from roles r where r.id = role_permissions.role_id and r.tenant_id = app.current_tenant_id())
  );
create policy role_permissions_delete on role_permissions
  for delete using (
    exists (select 1 from roles r where r.id = role_permissions.role_id and r.tenant_id = app.current_tenant_id())
  );

-- Penugasan peran: terlihat dalam konteks tenant, atau untuk keanggotaan
-- milik pengguna sendiri (dibutuhkan saat resolusi izin).
create policy membership_roles_select on membership_roles
  for select using (
    tenant_id = app.current_tenant_id()
    or exists (
      select 1 from tenant_memberships m
      where m.id = membership_roles.membership_id
        and m.user_id = app.current_user_id()
    )
  );
create policy membership_roles_insert on membership_roles
  for insert with check (tenant_id = app.current_tenant_id());
create policy membership_roles_delete on membership_roles
  for delete using (tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Hak akses role runtime (least privilege)
-- ---------------------------------------------------------------------------
grant select, insert, update on tenants to agentic_runtime;
grant select, insert, update, delete on tenant_memberships to agentic_runtime;
grant select on permissions to agentic_runtime;
grant select, insert, update, delete on roles to agentic_runtime;
grant select, insert, delete on role_permissions to agentic_runtime;
grant select, insert, delete on membership_roles to agentic_runtime;
