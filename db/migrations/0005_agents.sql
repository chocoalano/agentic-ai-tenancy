-- 0005_agents: Agent Instance (AI digital employee) milik tenant.
--
-- Phase 1 hanya menyimpan konfigurasi dasar. Status runtime (idle, working,
-- thinking, ...) TIDAK disimpan di sini; status tersebut akan datang dari
-- Agent Orchestrator pada fase berikutnya.

create table agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  slug text not null,
  name text not null,
  role_key text not null,
  role_title text not null,
  description text not null default '',
  main_instruction text not null default '',
  lifecycle_status text not null default 'draft',
  is_seed_data boolean not null default false,
  created_by_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_lifecycle_status_check check (lifecycle_status in ('draft', 'active', 'paused', 'archived')),
  constraint agents_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  constraint agents_role_key_format check (role_key ~ '^[a-z][a-z0-9-]{1,62}$'),
  constraint agents_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint agents_tenant_slug_key unique (tenant_id, slug),
  constraint agents_id_tenant_key unique (id, tenant_id)
);

create index agents_tenant_status_idx on agents (tenant_id, lifecycle_status);

create trigger agents_touch_updated_at
before update on agents
for each row execute function app.touch_updated_at();

alter table agents enable row level security;
alter table agents force row level security;

create policy agents_isolation on agents
  for all
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

grant select, insert, update, delete on agents to agentic_runtime;
