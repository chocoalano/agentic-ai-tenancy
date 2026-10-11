import type { SQL } from 'bun'

export interface RuntimeRoleReport {
  role: string
  isSuperuser: boolean
  bypassesRls: boolean
  /** Tabel tenant-scoped yang dimiliki role runtime (pemilik tabel dapat melewati RLS tanpa FORCE). */
  ownedTables: string[]
  /** Tabel tenant-scoped yang belum mengaktifkan atau memaksa RLS. */
  tablesWithoutForcedRls: string[]
}

/** Tabel yang wajib dilindungi RLS dengan `FORCE ROW LEVEL SECURITY`. */
export const RLS_PROTECTED_TABLES = [
  'tenants',
  'tenant_memberships',
  'roles',
  'role_permissions',
  'membership_roles',
  'agents',
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

  return {
    role: role?.role ?? 'unknown',
    isSuperuser: role?.is_superuser ?? false,
    bypassesRls: role?.bypasses_rls ?? false,
    ownedTables: tables.filter((table) => table.owned).map((table) => table.table_name),
    tablesWithoutForcedRls: [
      ...missing,
      ...tables.filter((table) => !table.rls_enabled || !table.rls_forced).map((table) => table.table_name),
    ],
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
  return problems
}
