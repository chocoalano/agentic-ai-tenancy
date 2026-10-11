import type { SQL } from 'bun'
import type { TenantContext } from '../../../domains/tenancy/types'
import { withTenantTransaction } from '../../core/database/transactions'
import { AppError, errors } from '../../core/errors/app-error'
import { runsRepository, type RunEventRecord, type RunOutputRecord, type RunRecord } from './repository'

/** Pembacaan run, jejak event, dan output (hanya untuk tenant aktif; RLS + filter eksplisit). */
export function createRunService(deps: { sql: SQL }) {
  const { sql } = deps

  async function requireRun(scope: Parameters<typeof runsRepository.findById>[0], runId: string): Promise<RunRecord> {
    const run = await runsRepository.findById(scope, runId)
    if (!run) throw errors.notFound('RUN_NOT_FOUND', 'Run tidak ditemukan.')
    return run
  }

  return {
    get(context: TenantContext, runId: string): Promise<RunRecord> {
      return withTenantTransaction(sql, context, (scope) => requireRun(scope, runId))
    },

    listForTask(context: TenantContext, taskId: string): Promise<RunRecord[]> {
      return withTenantTransaction(sql, context, (scope) => runsRepository.listForTask(scope, taskId))
    },

    listEvents(context: TenantContext, runId: string): Promise<RunEventRecord[]> {
      return withTenantTransaction(sql, context, async (scope) => {
        await requireRun(scope, runId)
        return runsRepository.listEvents(scope, runId)
      })
    },

    /**
     * Output run. 404 bila belum ada; 409 OUTPUT_PENDING_APPROVAL bila hasil
     * belum dirilis karena menunggu persetujuan (aksi yang dilindungi).
     */
    getOutput(context: TenantContext, runId: string): Promise<RunOutputRecord> {
      return withTenantTransaction(sql, context, async (scope) => {
        await requireRun(scope, runId)
        const output = await runsRepository.findOutput(scope, runId)
        if (!output) throw errors.notFound('OUTPUT_NOT_FOUND', 'Run ini belum memiliki hasil.')
        if (!output.released) {
          throw new AppError(409, 'OUTPUT_PENDING_APPROVAL', 'Hasil menunggu persetujuan sebelum dapat dilihat.')
        }
        return output
      })
    },
  }
}

export type RunService = ReturnType<typeof createRunService>
