-- 0008_agent_tasks: eksekusi tugas AI employee (Phase 5).
--
-- Entitas tenant-scoped (semua FORCE RLS):
--   agent_tasks        tugas yang diberikan pengguna kepada agent (state tingkat tugas)
--   agent_runs         satu percobaan eksekusi (klaim worker, lease, status, error aman, usage)
--   agent_run_events   jejak siklus hidup run (payload tersanitasi; tanpa prompt/penalaran model)
--   agent_run_outputs  hasil akhir run (dirilis ke pengguna setelah persetujuan bila diperlukan)
--   agent_approvals    permintaan persetujuan manusia yang dipersistenkan
--   realtime_outbox    outbox event realtime (ditulis dalam transaksi yang sama dengan perubahan state)
--
-- Akses lintas tenant HANYA lewat fungsi SECURITY DEFINER sempit milik role pemilik
-- (klaim antrean, lease kedaluwarsa, baca outbox untuk dispatcher, persetujuan kedaluwarsa,
-- pemangkasan outbox). Kebijakan "privileged caller" mengenali pemilik (bukan anggota group
-- agentic_runtime); role runtime tidak pernah dapat menjadi pemilik.
--
-- Konteks worker: app.actor = 'worker' (transaction-local) hanya di-set oleh
-- withWorkerTransaction (api/core/database/transactions.ts) untuk proses eksekusi.

-- ---------------------------------------------------------------------------
-- Izin baru (katalog global) + pemetaan ke peran sistem
-- ---------------------------------------------------------------------------
insert into permissions (key, description) values
  ('tasks.read', 'Melihat tugas, run, dan hasil kerja AI employee'),
  ('tasks.create', 'Memberi tugas kepada AI employee'),
  ('tasks.cancel', 'Membatalkan tugas AI employee'),
  ('approvals.read', 'Melihat permintaan persetujuan'),
  ('approvals.decide', 'Menyetujui atau menolak permintaan persetujuan');

-- role_permissions memakai FORCE RLS (pemilik pun tunduk); pemetaan peran sistem ditulis
-- dengan FORCE dinonaktifkan sementara di dalam transaksi migrasi ini saja.
alter table role_permissions no force row level security;
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on (
  (r.key in ('owner', 'admin')
    and p.key in ('tasks.read', 'tasks.create', 'tasks.cancel', 'approvals.read', 'approvals.decide'))
  or (r.key = 'member' and p.key in ('tasks.read', 'tasks.create', 'tasks.cancel', 'approvals.read'))
  or (r.key = 'viewer' and p.key in ('tasks.read', 'approvals.read'))
)
where r.tenant_id is null
on conflict do nothing;
alter table role_permissions force row level security;

-- ---------------------------------------------------------------------------
-- Fungsi konteks
-- ---------------------------------------------------------------------------
-- Pemanggil "privileged" = bukan anggota group runtime (mis. pemilik skema di dalam fungsi
-- SECURITY DEFINER). Role runtime selalu anggota agentic_runtime sehingga tidak bisa lolos.
create or replace function app.is_privileged_caller() returns boolean
language sql stable parallel safe
as $$ select not pg_has_role(current_user, 'agentic_runtime', 'member') $$;

-- Konteks worker eksekusi (ditetapkan transaction-local oleh withWorkerTransaction).
create or replace function app.is_worker() returns boolean
language sql stable parallel safe
as $$ select coalesce(current_setting('app.actor', true), '') = 'worker' $$;

revoke all on function app.is_privileged_caller() from public;
revoke all on function app.is_worker() from public;
grant execute on function app.is_privileged_caller() to agentic_runtime;
grant execute on function app.is_worker() to agentic_runtime;

-- ---------------------------------------------------------------------------
-- agent_tasks
-- ---------------------------------------------------------------------------
create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  agent_id uuid not null,
  created_by_user_id uuid references users (id) on delete set null,
  title text not null,
  instruction text not null,
  priority text not null default 'normal',
  status text not null default 'created',
  requires_approval boolean not null default false,
  idempotency_key text,
  latest_run_id uuid,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_code text,
  error_message text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  constraint agent_tasks_status_check check (
    status in ('created', 'queued', 'running', 'waiting_approval', 'completed', 'failed', 'canceled')
  ),
  constraint agent_tasks_priority_check check (priority in ('low', 'normal', 'high')),
  constraint agent_tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint agent_tasks_instruction_length check (char_length(instruction) between 1 and 8000),
  constraint agent_tasks_attempts_check check (attempts >= 0 and max_attempts between 1 and 10),
  constraint agent_tasks_idempotency_format check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  constraint agent_tasks_id_tenant_key unique (id, tenant_id),
  -- Referensi agent harus milik tenant yang sama (FK komposit; agents(id, tenant_id) unik).
  constraint agent_tasks_agent_fk foreign key (agent_id, tenant_id) references agents (id, tenant_id) on delete cascade,
  -- Idempotensi: kunci yang sama dari pengguna yang sama di tenant yang sama = tugas yang sama.
  constraint agent_tasks_idempotency_key unique (tenant_id, created_by_user_id, idempotency_key)
);

create index agent_tasks_tenant_created_idx on agent_tasks (tenant_id, created_at desc);
create index agent_tasks_tenant_agent_idx on agent_tasks (tenant_id, agent_id, created_at desc);
create index agent_tasks_tenant_status_idx on agent_tasks (tenant_id, status);

create trigger agent_tasks_touch_updated_at
before update on agent_tasks
for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- agent_runs
-- ---------------------------------------------------------------------------
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  task_id uuid not null,
  agent_id uuid not null,
  attempt integer not null default 1,
  status text not null default 'queued',
  runtime_provider text not null,
  runtime_model text not null,
  worker_id text,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancel_requested boolean not null default false,
  error_code text,
  error_message text,
  retryable boolean,
  provider_request_id text,
  usage_input_tokens integer,
  usage_output_tokens integer,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_runs_status_check check (
    status in ('queued', 'claimed', 'running', 'waiting_approval', 'completed', 'failed', 'canceled')
  ),
  constraint agent_runs_attempt_check check (attempt between 1 and 10),
  constraint agent_runs_id_tenant_key unique (id, tenant_id),
  constraint agent_runs_task_attempt_key unique (task_id, attempt),
  constraint agent_runs_task_fk foreign key (task_id, tenant_id) references agent_tasks (id, tenant_id) on delete cascade,
  constraint agent_runs_agent_fk foreign key (agent_id, tenant_id) references agents (id, tenant_id) on delete cascade
);

-- Antrean: hanya run yang belum terminal (klaim memakai FOR UPDATE SKIP LOCKED).
create index agent_runs_queue_idx on agent_runs (created_at, id) where status = 'queued';
create index agent_runs_lease_idx on agent_runs (lease_expires_at) where status in ('claimed', 'running');
create index agent_runs_tenant_task_idx on agent_runs (tenant_id, task_id, attempt desc);
create index agent_runs_tenant_agent_active_idx on agent_runs (tenant_id, agent_id)
  where status in ('queued', 'claimed', 'running', 'waiting_approval');

create trigger agent_runs_touch_updated_at
before update on agent_runs
for each row execute function app.touch_updated_at();

alter table agent_tasks
  add constraint agent_tasks_latest_run_fk
  foreign key (latest_run_id, tenant_id) references agent_runs (id, tenant_id) on delete no action;

-- ---------------------------------------------------------------------------
-- agent_run_events (append-only, payload tersanitasi)
-- ---------------------------------------------------------------------------
create table agent_run_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants (id) on delete cascade,
  run_id uuid not null,
  task_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agent_run_events_type_format check (event_type ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)*$'),
  constraint agent_run_events_payload_size check (pg_column_size(payload) <= 16384),
  constraint agent_run_events_run_fk foreign key (run_id, tenant_id) references agent_runs (id, tenant_id) on delete cascade,
  constraint agent_run_events_task_fk foreign key (task_id, tenant_id) references agent_tasks (id, tenant_id) on delete cascade
);

create index agent_run_events_run_idx on agent_run_events (tenant_id, run_id, id);

-- ---------------------------------------------------------------------------
-- agent_run_outputs (satu hasil akhir per run)
-- ---------------------------------------------------------------------------
create table agent_run_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  run_id uuid not null,
  task_id uuid not null,
  output_type text not null default 'text',
  content text not null,
  released boolean not null default true,
  created_at timestamptz not null default now(),
  constraint agent_run_outputs_type_check check (output_type in ('text', 'markdown')),
  constraint agent_run_outputs_content_size check (char_length(content) <= 200000),
  constraint agent_run_outputs_run_key unique (run_id),
  constraint agent_run_outputs_run_fk foreign key (run_id, tenant_id) references agent_runs (id, tenant_id) on delete cascade,
  constraint agent_run_outputs_task_fk foreign key (task_id, tenant_id) references agent_tasks (id, tenant_id) on delete cascade
);

create index agent_run_outputs_task_idx on agent_run_outputs (tenant_id, task_id);

-- ---------------------------------------------------------------------------
-- agent_approvals
-- ---------------------------------------------------------------------------
create table agent_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  task_id uuid not null,
  run_id uuid not null,
  agent_id uuid not null,
  action_type text not null,
  action_summary text not null,
  status text not null default 'pending',
  requested_by text not null default 'agent',
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_by_user_id uuid references users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint agent_approvals_status_check check (status in ('pending', 'approved', 'rejected', 'expired', 'canceled')),
  constraint agent_approvals_action_format check (action_type ~ '^[a-z][a-z_]*$'),
  constraint agent_approvals_summary_length check (char_length(action_summary) between 1 and 500),
  constraint agent_approvals_note_length check (decision_note is null or char_length(decision_note) <= 500),
  constraint agent_approvals_decision_consistency check (
    (status in ('approved', 'rejected') and decided_at is not null) or status in ('pending', 'expired', 'canceled')
  ),
  constraint agent_approvals_run_action_key unique (run_id, action_type),
  constraint agent_approvals_run_fk foreign key (run_id, tenant_id) references agent_runs (id, tenant_id) on delete cascade,
  constraint agent_approvals_task_fk foreign key (task_id, tenant_id) references agent_tasks (id, tenant_id) on delete cascade,
  constraint agent_approvals_agent_fk foreign key (agent_id, tenant_id) references agents (id, tenant_id) on delete cascade
);

create index agent_approvals_tenant_status_idx on agent_approvals (tenant_id, status, requested_at desc);
create index agent_approvals_pending_expiry_idx on agent_approvals (expires_at) where status = 'pending';

create trigger agent_approvals_touch_updated_at
before update on agent_approvals
for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- realtime_outbox (dispatch pasca-commit; id = SSE event id untuk replay Last-Event-ID)
-- ---------------------------------------------------------------------------
create table realtime_outbox (
  id bigserial primary key,
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_type text not null,
  schema_version integer not null default 1,
  agent_id uuid,
  task_id uuid,
  run_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint realtime_outbox_type_format check (event_type ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)*$'),
  constraint realtime_outbox_payload_size check (pg_column_size(payload) <= 16384)
);

create index realtime_outbox_tenant_id_idx on realtime_outbox (tenant_id, id);
create index realtime_outbox_created_idx on realtime_outbox (created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table agent_tasks enable row level security;
alter table agent_tasks force row level security;
alter table agent_runs enable row level security;
alter table agent_runs force row level security;
alter table agent_run_events enable row level security;
alter table agent_run_events force row level security;
alter table agent_run_outputs enable row level security;
alter table agent_run_outputs force row level security;
alter table agent_approvals enable row level security;
alter table agent_approvals force row level security;
alter table realtime_outbox enable row level security;
alter table realtime_outbox force row level security;

-- agent_tasks: dibaca dalam konteks tenant; dibuat oleh pengguna ber-izin tasks.create;
-- diubah oleh worker, pembatal (tasks.cancel), atau pengambil keputusan persetujuan.
create policy agent_tasks_select on agent_tasks
  for select using (tenant_id = app.current_tenant_id() or app.is_privileged_caller());
create policy agent_tasks_insert on agent_tasks
  for insert with check (
    tenant_id = app.current_tenant_id()
    and (app.has_permission('tasks.create') or app.is_worker())
    and (app.is_worker() or created_by_user_id = app.current_user_id())
  );
create policy agent_tasks_update on agent_tasks
  for update using (
    (tenant_id = app.current_tenant_id()
      and (app.is_worker() or app.has_permission('tasks.cancel') or app.has_permission('approvals.decide')))
    or app.is_privileged_caller()
  )
  with check (tenant_id = app.current_tenant_id() or app.is_privileged_caller());

-- agent_runs
create policy agent_runs_select on agent_runs
  for select using (tenant_id = app.current_tenant_id() or app.is_privileged_caller());
create policy agent_runs_insert on agent_runs
  for insert with check (
    tenant_id = app.current_tenant_id() and (app.has_permission('tasks.create') or app.is_worker())
  );
create policy agent_runs_update on agent_runs
  for update using (
    (tenant_id = app.current_tenant_id()
      and (app.is_worker() or app.has_permission('tasks.cancel') or app.has_permission('approvals.decide')))
    or app.is_privileged_caller()
  )
  with check (tenant_id = app.current_tenant_id() or app.is_privileged_caller());

-- agent_run_events: append-only
create policy agent_run_events_select on agent_run_events
  for select using (tenant_id = app.current_tenant_id() or app.is_privileged_caller());
create policy agent_run_events_insert on agent_run_events
  for insert with check (tenant_id = app.current_tenant_id());

-- agent_run_outputs: ditulis worker; rilis (released) oleh worker atau pengambil keputusan
create policy agent_run_outputs_select on agent_run_outputs
  for select using (tenant_id = app.current_tenant_id() or app.is_privileged_caller());
create policy agent_run_outputs_insert on agent_run_outputs
  for insert with check (tenant_id = app.current_tenant_id() and app.is_worker());
create policy agent_run_outputs_update on agent_run_outputs
  for update using (
    tenant_id = app.current_tenant_id() and (app.is_worker() or app.has_permission('approvals.decide'))
  )
  with check (tenant_id = app.current_tenant_id());

-- agent_approvals: dibuat worker; diputuskan oleh pemegang approvals.decide; kedaluwarsa oleh worker
create policy agent_approvals_select on agent_approvals
  for select using (tenant_id = app.current_tenant_id() or app.is_privileged_caller());
create policy agent_approvals_insert on agent_approvals
  for insert with check (tenant_id = app.current_tenant_id() and app.is_worker());
create policy agent_approvals_update on agent_approvals
  for update using (
    (tenant_id = app.current_tenant_id() and (app.is_worker() or app.has_permission('approvals.decide')))
    or app.is_privileged_caller()
  )
  with check (tenant_id = app.current_tenant_id() or app.is_privileged_caller());

-- realtime_outbox: ditulis dalam konteks tenant mana pun; dibaca lintas tenant hanya oleh dispatcher (definer)
create policy realtime_outbox_select on realtime_outbox
  for select using (tenant_id = app.current_tenant_id() or app.is_privileged_caller());
create policy realtime_outbox_insert on realtime_outbox
  for insert with check (tenant_id = app.current_tenant_id());
create policy realtime_outbox_delete on realtime_outbox
  for delete using (app.is_privileged_caller());

-- ---------------------------------------------------------------------------
-- Fungsi SECURITY DEFINER sempit (lintas tenant, hanya untuk proses sistem)
-- ---------------------------------------------------------------------------
-- Klaim satu run antrean secara atomik (FOR UPDATE SKIP LOCKED) dengan lease.
create or replace function app.claim_agent_run(p_worker_id text, p_lease_seconds integer)
returns table (run_id uuid, tenant_id uuid, task_id uuid, agent_id uuid, attempt integer, runtime_provider text, runtime_model text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  candidate uuid;
begin
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 3600 then
    raise exception 'lease tidak valid' using errcode = '22023';
  end if;
  select ar.id into candidate
  from agent_runs ar
  where ar.status = 'queued'
  order by ar.created_at, ar.id
  limit 1
  for update skip locked;
  if candidate is null then
    return;
  end if;
  return query
    update agent_runs ar
       set status = 'claimed',
           worker_id = p_worker_id,
           claimed_at = now(),
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           version = ar.version + 1
     where ar.id = candidate and ar.status = 'queued'
    returning ar.id, ar.tenant_id, ar.task_id, ar.agent_id, ar.attempt, ar.runtime_provider, ar.runtime_model;
end
$$;

-- Run yang lease-nya kedaluwarsa (worker mati/terputus); pemulihan dilakukan per tenant oleh worker.
create or replace function app.expired_run_leases()
returns table (run_id uuid, tenant_id uuid)
language sql security definer stable
set search_path = public, pg_temp
as $$
  select ar.id, ar.tenant_id
  from agent_runs ar
  where ar.status in ('claimed', 'running') and ar.lease_expires_at < now()
  order by ar.lease_expires_at
  limit 100
$$;

-- Persetujuan tertunda yang kedaluwarsa.
create or replace function app.expired_pending_approvals()
returns table (approval_id uuid, tenant_id uuid)
language sql security definer stable
set search_path = public, pg_temp
as $$
  select a.id, a.tenant_id
  from agent_approvals a
  where a.status = 'pending' and a.expires_at < now()
  order by a.expires_at
  limit 100
$$;

-- Outbox setelah id tertentu (dispatcher SSE memfilter per tenant & izin per koneksi).
create or replace function app.realtime_outbox_after(p_after bigint, p_limit integer)
returns setof realtime_outbox
language sql security definer stable
set search_path = public, pg_temp
as $$
  select o.*
  from realtime_outbox o
  where o.id > p_after
  order by o.id
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
$$;

create or replace function app.realtime_outbox_latest_id()
returns bigint
language sql security definer stable
set search_path = public, pg_temp
as $$ select coalesce(max(o.id), 0) from realtime_outbox o $$;

-- Pemangkasan outbox (retensi); replay Last-Event-ID hanya dijamin dalam retensi.
create or replace function app.prune_realtime_outbox(p_keep_hours integer)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  if p_keep_hours is null or p_keep_hours < 1 or p_keep_hours > 720 then
    raise exception 'retensi tidak valid' using errcode = '22023';
  end if;
  delete from realtime_outbox where created_at < now() - make_interval(hours => p_keep_hours);
  get diagnostics removed = row_count;
  return removed;
end
$$;

revoke all on function app.claim_agent_run(text, integer) from public;
revoke all on function app.expired_run_leases() from public;
revoke all on function app.expired_pending_approvals() from public;
revoke all on function app.realtime_outbox_after(bigint, integer) from public;
revoke all on function app.realtime_outbox_latest_id() from public;
revoke all on function app.prune_realtime_outbox(integer) from public;
grant execute on function app.claim_agent_run(text, integer) to agentic_runtime;
grant execute on function app.expired_run_leases() to agentic_runtime;
grant execute on function app.expired_pending_approvals() to agentic_runtime;
grant execute on function app.realtime_outbox_after(bigint, integer) to agentic_runtime;
grant execute on function app.realtime_outbox_latest_id() to agentic_runtime;
grant execute on function app.prune_realtime_outbox(integer) to agentic_runtime;

-- ---------------------------------------------------------------------------
-- Hak akses role runtime (least privilege; tanpa DELETE pada data bisnis)
-- ---------------------------------------------------------------------------
grant select, insert, update on agent_tasks to agentic_runtime;
grant select, insert, update on agent_runs to agentic_runtime;
grant select, insert on agent_run_events to agentic_runtime;
grant select, insert, update on agent_run_outputs to agentic_runtime;
grant select, insert, update on agent_approvals to agentic_runtime;
grant select, insert on realtime_outbox to agentic_runtime;
grant usage, select on sequence agent_run_events_id_seq to agentic_runtime;
grant usage, select on sequence realtime_outbox_id_seq to agentic_runtime;
