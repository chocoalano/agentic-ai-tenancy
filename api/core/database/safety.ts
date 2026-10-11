import type { SQL } from 'bun'

export interface RuntimeRoleReport {
  role: string
  isSuperuser: boolean
  bypassesRls: boolean
  /** Tabel tenant-scoped yang dimiliki role runtime (pemilik tabel dapat melewati RLS tanpa FORCE). */
  ownedTables: string[]
  /** Tabel tenant-scoped yang belum mengaktifkan atau memaksa RLS. */
  tablesWithoutForcedRls: string[]
  /** Tabel ber-kolom `tenant_id` yang tidak terdaftar di RLS_PROTECTED_TABLES (lolos pengawasan). */
  unlistedTenantTables: string[]
}

/** Tabel yang wajib dilindungi RLS dengan `FORCE ROW LEVEL SECURITY`. */
export const RLS_PROTECTED_TABLES = [
  'tenants',
  'tenant_memberships',
  'roles',
  'role_permissions',
  'membership_roles',
  'agents',
  'agent_tasks',
  'agent_runs',
  'agent_run_events',
  'agent_run_outputs',
  'agent_approvals',
  'realtime_outbox',
] as const

/**
 * Memeriksa bahwa role database yang dipakai aplikasi benar-benar tunduk pada
 * RLS: bukan superuser, tidak memiliki BYPASSRLS, tidak memiliki tabel
 * tenant-scoped, dan semua tabel tersebut memakai FORCE RLS.
 */
export async function inspectRuntimeRole(sql: SQL): Promise<RuntimeRoleReport> {
  const [role] = await sql<{ role: string; is_superuser: boolean; bypasses_rls: boolean }[]>`
    select current_user as role, rolsuper as is_superuser, rolbypassrls as bypasses_rls
    from pg_roles
    where rolname = current_user
  `
  const tables = await sql<{ table_name: string; owned: boolean; rls_enabled: boolean; rls_forced: boolean }[]>`
    select
      c.relname as table_name,
      pg_get_userbyid(c.relowner) = current_user as owned,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any(${sql.array([...RLS_PROTECTED_TABLES], 'TEXT')})
  `
  const present = new Set(tables.map((table) => table.table_name))
  const missing = RLS_PROTECTED_TABLES.filter((name) => !present.has(name))
  // Setiap tabel yang membawa kolom tenant_id WAJIB ada di daftar (dan dengan demikian diperiksa FORCE RLS-nya).
  // Dibaca dari pg_catalog (bukan information_schema, yang menyembunyikan tabel tanpa GRANT ke role ini).
  const tenantColumns = await sql<{ table_name: string }[]>`
    select c.relname as table_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and a.attname = 'tenant_id' and not a.attisdropped
  `
  const listed = new Set<string>(RLS_PROTECTED_TABLES)
  const unlisted = tenantColumns.map((row) => row.table_name).filter((name) => !listed.has(name))

  return {
    role: role?.role ?? 'unknown',
    isSuperuser: role?.is_superuser ?? false,
    bypassesRls: role?.bypasses_rls ?? false,
    ownedTables: tables.filter((table) => table.owned).map((table) => table.table_name),
    tablesWithoutForcedRls: [
      ...missing,
      ...tables.filter((table) => !table.rls_enabled || !table.rls_forced).map((table) => table.table_name),
    ],
    unlistedTenantTables: unlisted,
  }
}

export function describeRuntimeRoleProblems(report: RuntimeRoleReport): string[] {
  const problems: string[] = []
  if (report.isSuperuser) problems.push(`role "${report.role}" adalah superuser (RLS dilewati)`)
  if (report.bypassesRls) problems.push(`role "${report.role}" memiliki atribut BYPASSRLS`)
  if (report.ownedTables.length > 0) {
    problems.push(`role "${report.role}" memiliki tabel: ${report.ownedTables.join(', ')}`)
  }
  if (report.tablesWithoutForcedRls.length > 0) {
    problems.push(`tabel tanpa RLS/FORCE RLS atau belum dimigrasi: ${report.tablesWithoutForcedRls.join(', ')}`)
  }
  if (report.unlistedTenantTables.length > 0) {
    problems.push(
      `tabel ber-kolom tenant_id di luar RLS_PROTECTED_TABLES (tambahkan ke daftar + FORCE RLS): ${report.unlistedTenantTables.join(', ')}`,
    )
  }
  return problems
}
