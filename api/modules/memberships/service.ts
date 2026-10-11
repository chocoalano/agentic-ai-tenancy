import type { SQL } from 'bun'
import { withUserTransaction } from '../../core/database/transactions'
import { membershipsRepository, type MembershipSummary } from './repository'

export function createMembershipService(deps: { sql: SQL }) {
  return {
    listForUser(userId: string): Promise<MembershipSummary[]> {
      return withUserTransaction(deps.sql, userId, (scope) => membershipsRepository.listForUser(scope))
    },
  }
}

export type MembershipService = ReturnType<typeof createMembershipService>
