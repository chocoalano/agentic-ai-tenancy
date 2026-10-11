-- 0001_foundation: skema helper konteks aplikasi.
--
-- Migrasi dijalankan oleh role pemilik skema (DATABASE_MIGRATION_URL).
-- Role runtime aplikasi mendapat hak akses melalui group role tetap
-- `agentic_runtime` yang dibuat oleh `bun run db:bootstrap`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agentic_runtime') then
    raise exception 'Role agentic_runtime belum ada. Jalankan "bun run db:bootstrap" terlebih dahulu.';
  end if;
end
$$;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to agentic_runtime;

-- Konteks transaksi. Nilai di-set aplikasi dengan set_config(..., true)
-- sehingga otomatis hilang saat transaksi selesai.
create or replace function app.current_tenant_id() returns uuid
language sql stable parallel safe
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function app.current_user_id() returns uuid
language sql stable parallel safe
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

revoke all on all functions in schema app from public;
grant execute on function app.current_tenant_id() to agentic_runtime;
grant execute on function app.current_user_id() to agentic_runtime;
