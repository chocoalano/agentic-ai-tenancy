import { t } from 'elysia'
import {
  APPROVAL_ACTION_TYPES,
  APPROVAL_STATUSES,
  OUTPUT_TYPES,
  RUN_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../../../domains/tasks/types'
import { Timestamp, Uuid, optionalEnum } from '../../shared/schemas'

const NullableTimestamp = t.Union([Timestamp, t.Null()])
const NullableString = t.Union([t.String(), t.Null()])
const NullableInt = t.Union([t.Integer(), t.Null()])

export const RunSchema = t.Object(
  {
    id: Uuid,
    taskId: Uuid,
    agentId: Uuid,
    attempt: t.Integer({ minimum: 1 }),
    status: t.UnionEnum(RUN_STATUSES),
    runtimeProvider: t.String(),
    runtimeModel: t.String(),
    claimedAt: NullableTimestamp,
    startedAt: NullableTimestamp,
    completedAt: NullableTimestamp,
    cancelRequested: t.Boolean(),
    errorCode: NullableString,
    errorMessage: NullableString,
    retryable: t.Union([t.Boolean(), t.Null()]),
    providerRequestId: NullableString,
    usage: t.Union([t.Object({ inputTokens: NullableInt, outputTokens: NullableInt }), t.Null()], {
      description: 'Pemakaian token dari provider; null bila provider tidak melaporkannya (tidak pernah ditebak)',
    }),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { title: 'AgentRun' },
)

export const TaskSchema = t.Object(
  {
    id: Uuid,
    agentId: Uuid,
    agentName: t.String(),
    createdByUserId: t.Union([Uuid, t.Null()]),
    title: t.String(),
    instruction: t.String(),
    priority: t.UnionEnum(TASK_PRIORITIES),
    status: t.UnionEnum(TASK_STATUSES),
    requiresApproval: t.Boolean(),
    latestRun: t.Union([RunSchema, t.Null()]),
    attempts: t.Integer({ minimum: 0 }),
    maxAttempts: t.Integer({ minimum: 1 }),
    errorCode: NullableString,
    errorMessage: NullableString,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    queuedAt: NullableTimestamp,
    startedAt: NullableTimestamp,
    completedAt: NullableTimestamp,
  },
  { title: 'AgentTask' },
)

export const TaskDetailSchema = t.Composite(
  [
    TaskSchema,
    t.Object({
      runs: t.Array(RunSchema),
      output: t.Union([
        t.Object({ runId: Uuid, outputType: t.UnionEnum(OUTPUT_TYPES), released: t.Boolean(), createdAt: Timestamp }),
        t.Null(),
      ]),
    }),
  ],
  { title: 'AgentTaskDetail' },
)

export const RunEventSchema = t.Object(
  {
    id: t.Integer(),
    runId: Uuid,
    taskId: Uuid,
    eventType: t.String(),
    payload: t.Record(t.String(), t.Unknown()),
    createdAt: Timestamp,
  },
  { title: 'AgentRunEvent' },
)

export const RunOutputSchema = t.Object(
  {
    runId: Uuid,
    taskId: Uuid,
    outputType: t.UnionEnum(OUTPUT_TYPES),
    content: t.String(),
    released: t.Boolean(),
    createdAt: Timestamp,
  },
  { title: 'AgentRunOutput' },
)

export const ApprovalSchema = t.Object(
  {
    id: Uuid,
    taskId: Uuid,
    runId: Uuid,
    agentId: Uuid,
    actionType: t.UnionEnum(APPROVAL_ACTION_TYPES),
    actionSummary: t.String(),
    status: t.UnionEnum(APPROVAL_STATUSES),
    requestedBy: t.String(),
    requestedAt: Timestamp,
    expiresAt: Timestamp,
    decidedByUserId: t.Union([Uuid, t.Null()]),
    decidedAt: NullableTimestamp,
    decisionNote: NullableString,
  },
  { title: 'AgentApproval' },
)

export const CapabilitiesSchema = t.Object(
  {
    runtime: t.Object({
      available: t.Boolean({ description: 'false = eksekusi nyata tidak tersedia (runtime belum dikonfigurasi)' }),
      kind: t.UnionEnum(['real', 'fixture', 'none'], {
        description: 'real = provider AI nyata; fixture = adapter deterministik (bukan AI; non-production)',
      }),
      provider: t.String(),
      model: t.String(),
    }),
    canCreate: t.Boolean(),
    canCancel: t.Boolean(),
    limits: t.Object({
      maxInstructionChars: t.Integer(),
      maxActiveTasks: t.Integer(),
      dailyTaskLimit: t.Integer(),
      maxAttempts: t.Integer(),
    }),
    usage: t.Object({ activeTasks: t.Integer(), createdToday: t.Integer() }),
  },
  { title: 'TaskCapabilities' },
)

export const CreateTaskBody = t.Object({
  agentId: Uuid,
  instruction: t.String({ minLength: 1, maxLength: 8000 }),
  title: t.Optional(t.String({ maxLength: 200 })),
  priority: optionalEnum(TASK_PRIORITIES, 'Prioritas (default normal)'),
  requiresApproval: t.Optional(t.Boolean({ description: 'Hasil hanya dirilis setelah disetujui (approvals.decide)' })),
  idempotencyKey: t.Optional(
    t.String({
      pattern: '^[A-Za-z0-9._:-]{8,128}$',
      description: 'Kunci idempotensi per pengguna: pengiriman ulang mengembalikan tugas yang sama',
    }),
  ),
})

export const DecideApprovalBody = t.Object({
  decision: t.UnionEnum(['approve', 'reject']),
  note: t.Optional(t.String({ maxLength: 500 })),
})
