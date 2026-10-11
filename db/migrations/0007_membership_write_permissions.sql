-- 0007: penulisan keanggotaan & peran memerlukan izin members.manage (ditegakkan DATABASE).
--
-- Sebelumnya kebijakan tulis pada tenant_memberships, membership_roles, roles, dan
-- role_permissions hanya memeriksa tenant_id = tenant aktif, sehingga anggota biasa
-- dalam konteks tenant dapat menautkan peran "owner" ke keanggotaannya sendiri
-- (eskalasi hak) bila ada jalur aplikasi yang lalai. Kini setiap INSERT/UPDATE/DELETE
-- pada tabel-tabel itu mensyaratkan pengguna saat ini memegang izin members.manage di
-- tenant aktif, dengan satu pengecualian terkontrol: bootstrap pembuat tenant
-- (tenants.created_by_user_id = pengguna saat ini) boleh membuat keanggotaan dan peran
-- untuk DIRINYA SENDIRI (dan hanya peran sistem "owner"). Kebijakan TIDAK boleh
-- men-subselect relasinya sendiri (PostgreSQL: "infinite recursion detected in policy");
-- pembacaan lewat fungsi app.has_permission() aman.

-- Izin pengguna saat ini di tenant aktif (membaca tabel di bawah RLS yang sama).
create or replace function app.has_permission(permission_key text) returns boolean
language sql stable parallel safe
as $$
  select exists (
    select 1
    from tenant_memberships m
    join membership_roles mr on mr.membership_id = m.id and mr.tenant_id = m.tenant_id
    join role_permissions rp on rp.role_id = mr.role_id
    join permissions p on p.id = rp.permission_id
    where m.tenant_id = app.current_tenant_id()
      and m.user_id = app.current_user_id()
      and m.status = 'active'
      and p.key = permission_key
  )
$$;

-- Pengguna saat ini adalah pembuat tenant aktif (konteks bootstrap pembuatan tenant).
create or replace function app.is_tenant_creator() returns boolean
language sql stable parallel safe
as $$
  select exists (
    select 1 from tenants t
    where t.id = app.current_tenant_id() and t.created_by_user_id = app.current_user_id()
  )
$$;

revoke all on function app.has_permission(text) from public;
revoke all on function app.is_tenant_creator() from public;
grant execute on function app.has_permission(text) to agentic_runtime;
grant execute on function app.is_tenant_creator() to agentic_runtime;

-- tenant_memberships ------------------------------------------------------------
drop policy if exists tenant_memberships_insert on tenant_memberships;
create policy tenant_memberships_insert on tenant_memberships
  for insert with check (
    tenant_id = app.current_tenant_id()
    and (app.has_permission('members.manage') or (user_id = app.current_user_id() and app.is_tenant_creator()))
  );

drop policy if exists tenant_memberships_update on tenant_memberships;
create policy tenant_memberships_update on tenant_memberships
  for update using (tenant_id = app.current_tenant_id() and app.has_permission('members.manage'))
  with check (tenant_id = app.current_tenant_id());

drop policy if exists tenant_memberships_delete on tenant_memberships;
create policy tenant_memberships_delete on tenant_memberships
  for delete using (tenant_id = app.current_tenant_id() and app.has_permission('members.manage'));

-- membership_roles --------------------------------------------------------------
drop policy if exists membership_roles_insert on membership_roles;
create policy membership_roles_insert on membership_roles
  for insert with check (
    tenant_id = app.current_tenant_id()
    and (
      app.has_permission('members.manage')
      or (
        app.is_tenant_creator()
        and exists (
          select 1 from tenant_memberships m
          where m.id = membership_id and m.user_id = app.current_user_id() and m.tenant_id = app.current_tenant_id()
        )
        and exists (select 1 from roles r where r.id = role_id and r.is_system and r.key = 'owner')
      )
    )
  );

drop policy if exists membership_roles_delete on membership_roles;
create policy membership_roles_delete on membership_roles
  for delete using (tenant_id = app.current_tenant_id() and app.has_permission('members.manage'));

-- roles (peran kustom tenant) ----------------------------------------------------
drop policy if exists roles_insert on roles;
create policy roles_insert on roles
  for insert with check (
    tenant_id = app.current_tenant_id() and not is_system and app.has_permission('members.manage')
  );

drop policy if exists roles_update on roles;
create policy roles_update on roles
  for update using (tenant_id = app.current_tenant_id() and app.has_permission('members.manage'))
  with check (tenant_id = app.current_tenant_id() and not is_system);

drop policy if exists roles_delete on roles;
create policy roles_delete on roles
  for delete using (tenant_id = app.current_tenant_id() and app.has_permission('members.manage'));

-- role_permissions (hanya untuk peran kustom tenant) ------------------------------
drop policy if exists role_permissions_insert on role_permissions;
create policy role_permissions_insert on role_permissions
  for insert with check (
    app.has_permission('members.manage')
    and exists (
      select 1 from roles r
      where r.id = role_permissions.role_id and r.tenant_id = app.current_tenant_id() and not r.is_system
    )
  );

drop policy if exists role_permissions_delete on role_permissions;
create policy role_permissions_delete on role_permissions
  for delete using (
    app.has_permission('members.manage')
    and exists (
      select 1 from roles r
      where r.id = role_permissions.role_id and r.tenant_id = app.current_tenant_id() and not r.is_system
    )
  );
