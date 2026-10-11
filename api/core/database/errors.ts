import { SQL } from 'bun'
import { AppError } from '../errors/app-error'

/**
 * Menormalkan error PostgreSQL menjadi AppError yang aman untuk klien.
 * Mengembalikan `null` untuk error yang tidak dikenali (akan menjadi 500).
 *
 * Pesan asli PostgreSQL (nama tabel, constraint, nilai) tidak pernah
 * diteruskan ke klien.
 */
export function normalizeDatabaseError(error: unknown): AppError | null {
  if (!(error instanceof SQL.SQLError)) return null

  if (error instanceof SQL.PostgresError) {
    const sqlState = error.errno
    switch (sqlState) {
      case '23505':
        return new AppError(409, 'RESOURCE_CONFLICT', 'Data yang sama sudah ada.')
      case '23503':
        return new AppError(409, 'REFERENCE_CONFLICT', 'Data terkait tidak ditemukan atau masih digunakan.')
      case '23502':
      case '23514':
      case '22001':
      case '22P02':
      case '22007':
      case '22008':
        return new AppError(422, 'INVALID_DATA', 'Data tidak memenuhi aturan validasi.')
      case '42501':
        // Termasuk pelanggaran Row Level Security ("new row violates row-level security policy").
        return new AppError(403, 'DATABASE_ACCESS_DENIED', 'Akses ke data ini ditolak.')
      case '40001':
      case '40P01':
        return new AppError(503, 'TRANSACTION_CONFLICT', 'Terjadi konflik transaksi. Silakan coba lagi.')
      case '57P01':
      case '57P02':
      case '57P03':
      case '53300':
        return new AppError(503, 'DATABASE_UNAVAILABLE', 'Database sedang tidak tersedia.')
      default:
        if (sqlState?.startsWith('08')) {
          return new AppError(503, 'DATABASE_UNAVAILABLE', 'Database sedang tidak tersedia.')
        }
    }
    // Error koneksi dari driver Bun tidak membawa SQLSTATE.
    if (error.code.startsWith('ERR_POSTGRES_CONNECTION') || error.code.includes('TIMEOUT')) {
      return new AppError(503, 'DATABASE_UNAVAILABLE', 'Database sedang tidak tersedia.')
    }
    return null
  }

  return null
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    error instanceof SQL.PostgresError &&
    error.errno === '23505' &&
    (constraint === undefined || error.constraint === constraint)
  )
}
