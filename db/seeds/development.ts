/**
 * Seed data PENGEMBANGAN LOKAL. Tidak pernah berjalan dengan NODE_ENV=production.
 *
 * Seed dijalankan dengan role runtime aplikasi (DATABASE_URL) melalui helper
 * transaksi yang sama dengan aplikasi, sehingga seluruh data ditulis di bawah
 * kebijakan RLS. Semua agent ditandai `is_seed_data = true`.
 *
 * Akun:
 *   alya@nusantara.test  → owner "PT Nusantara Digital", member "Garuda Logistik"
 *   bima@garuda.test     → owner "Garuda Logistik"
 *   citra@nusantara.test → viewer "PT Nusantara Digital"
 */
import { randomUUID } from 'node:crypto'
import type { SQL } from 'bun'
import { hashPassword } from '../../api/core/auth/password'
import { loadApiConfig } from '../../api/core/config/env'
import { createDatabasePool } from '../../api/core/database/client'
import { withNewTenantTransaction, withTenantTransaction, withTransaction } from '../../api/core/database/transactions'
import { resolveTenantContext } from '../../api/core/tenancy/resolve-context'
import { tenantsRepository } from '../../api/modules/tenants/repository'
import { usersRepository } from '../../api/modules/users/repository'
import type { AgentLifecycleStatus } from '../../domains/agents/types'
import type { TenantContext } from '../../domains/tenancy/types'

if (process.env.NODE_ENV === 'production') {
  console.error('✖ Seed pengembangan tidak boleh dijalankan dengan NODE_ENV=production.')
  process.exit(1)
}

const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'VirtualOffice!2026'
const REQUEST_ID = 'development-seed'

interface SeedAgent {
  slug: string
  name: string
  role_key: string
  role_title: string
  description: string
  main_instruction: string
  lifecycle_status: AgentLifecycleStatus
}

const NUSANTARA_AGENTS: SeedAgent[] = [
  {
    slug: 'nara',
    name: 'Nara',
    role_key: 'customer-support',
    role_title: 'Customer Support Specialist',
    description: 'Menjawab pertanyaan pelanggan dan meneruskan kasus kompleks ke tim manusia.',
    main_instruction: 'Layani pelanggan dengan ramah dan ringkas. Eskalasi keluhan pembayaran ke tim keuangan.',
    lifecycle_status: 'active',
  },
  {
    slug: 'dimas',
    name: 'Dimas',
    role_key: 'sales-development',
    role_title: 'Sales Development Representative',
    description: 'Mengkualifikasi prospek masuk dan menyiapkan jadwal demo untuk tim sales.',
    main_instruction: 'Kualifikasi prospek berdasarkan ukuran perusahaan dan kebutuhan. Jangan menjanjikan harga.',
    lifecycle_status: 'active',
  },
  {
    slug: 'sekar',
    name: 'Sekar',
    role_key: 'finance-analyst',
    role_title: 'Finance Analyst',
    description: 'Merangkum laporan arus kas mingguan dan menandai anomali pengeluaran.',
    main_instruction: 'Buat ringkasan arus kas mingguan. Tandai pengeluaran di atas ambang yang ditetapkan.',
    lifecycle_status: 'paused',
  },
  {
    slug: 'arka',
    name: 'Arka',
    role_key: 'hr-recruiter',
    role_title: 'HR Recruiter',
    description: 'Menyaring CV kandidat sesuai deskripsi pekerjaan.',
    main_instruction:
      'Nilai kecocokan kandidat terhadap kriteria wajib. Jangan menilai berdasarkan data pribadi sensitif.',
    lifecycle_status: 'draft',
  },
]

const GARUDA_AGENTS: SeedAgent[] = [
  {
    slug: 'raka',
    name: 'Raka',
    role_key: 'logistics-coordinator',
    role_title: 'Logistics Coordinator',
    description: 'Memantau status pengiriman dan menyiapkan pembaruan untuk pelanggan korporat.',
    main_instruction: 'Pantau SLA pengiriman. Laporkan keterlambatan lebih dari 24 jam ke supervisor.',
    lifecycle_status: 'active',
  },
  {
    slug: 'laras',
    name: 'Laras',
    role_key: 'procurement-analyst',
    role_title: 'Procurement Analyst',
    description: 'Membandingkan penawaran vendor dan menyiapkan rekomendasi pembelian.',
    main_instruction: 'Bandingkan minimal tiga penawaran. Sertakan risiko vendor pada setiap rekomendasi.',
    lifecycle_status: 'active',
  },
  {
    slug: 'bayu',
    name: 'Bayu',
    role_key: 'fleet-monitoring',
    role_title: 'Fleet Monitoring Analyst',
    description: 'Menganalisis data armada untuk jadwal perawatan preventif.',
    main_instruction: 'Susun jadwal perawatan berdasarkan jarak tempuh dan riwayat kerusakan.',
    lifecycle_status: 'draft',
  },
]

async function createUser(sql: SQL, email: string, displayName: string, passwordHash: string) {
  return withTransaction(sql, (tx) => usersRepository.create(tx, { email, displayName, passwordHash }))
}

async function createTenant(sql: SQL, ownerId: string, slug: string, name: string): Promise<TenantContext> {
  const tenantId = randomUUID()
  await withNewTenantTransaction(sql, { tenantId, userId: ownerId, requestId: REQUEST_ID }, (scope) =>
    tenantsRepository.createWithOwner(scope, { slug, name }),
  )
  const context = await resolveTenantContext(sql, { userId: ownerId, tenantId, requestId: REQUEST_ID })
  if (!context) throw new Error(`Gagal me-resolve konteks owner untuk tenant ${slug}`)
  return context
}

async function addMember(sql: SQL, ownerContext: TenantContext, userId: string, roleKey: string) {
  await withTenantTransaction(sql, ownerContext, async ({ sql: tx, context }) => {
    const [membership] = await tx<{ id: string }[]>`
      insert into tenant_memberships (tenant_id, user_id, status)
      values (${context.tenantId}, ${userId}, 'active')
      returning id
    `
    if (!membership) throw new Error('Insert keanggotaan gagal')
    await tx`
      insert into membership_roles (membership_id, tenant_id, role_id)
      select ${membership.id}, ${context.tenantId}, id from roles where tenant_id is null and key = ${roleKey}
    `
  })
}

async function addAgents(sql: SQL, ownerContext: TenantContext, agents: SeedAgent[]) {
  await withTenantTransaction(sql, ownerContext, async ({ sql: tx, context }) => {
    const rows = agents.map((agent) => ({
      ...agent,
      tenant_id: context.tenantId,
      created_by_user_id: context.userId,
      is_seed_data: true,
    }))
    await tx`insert into agents ${tx(rows)}`
  })
}

const config = loadApiConfig()
const sql = createDatabasePool(config.database)

try {
  const existing = await usersRepository.findCredentialsByEmail(sql, 'alya@nusantara.test')
  if (existing) {
    console.log('• Seed pengembangan sudah ada. Gunakan "bun run db:reset && bun run db:seed" untuk mengulang.')
  } else {
    const passwordHash = await hashPassword(SEED_PASSWORD)
    const alya = await createUser(sql, 'alya@nusantara.test', 'Alya Pratama', passwordHash)
    const bima = await createUser(sql, 'bima@garuda.test', 'Bima Santoso', passwordHash)
    const citra = await createUser(sql, 'citra@nusantara.test', 'Citra Lestari', passwordHash)

    const nusantara = await createTenant(sql, alya.id, 'nusantara-digital', 'PT Nusantara Digital')
    const garuda = await createTenant(sql, bima.id, 'garuda-logistik', 'Garuda Logistik')

    await addMember(sql, nusantara, citra.id, 'viewer')
    await addMember(sql, garuda, alya.id, 'member')
    await addAgents(sql, nusantara, NUSANTARA_AGENTS)
    await addAgents(sql, garuda, GARUDA_AGENTS)

    console.log('✓ Seed pengembangan selesai (khusus lokal).')
    console.log(`  Password semua akun: ${SEED_PASSWORD}`)
    console.log('  alya@nusantara.test  → owner PT Nusantara Digital, member Garuda Logistik')
    console.log('  bima@garuda.test     → owner Garuda Logistik')
    console.log('  citra@nusantara.test → viewer PT Nusantara Digital')
  }
} catch (error) {
  console.error('✖ Seed gagal:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.close()
}
