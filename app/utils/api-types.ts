import type { NuxtApp } from '#app'

/*
 * Tipe data API diturunkan langsung dari klien Eden Treaty (`$api`), yang
 * tipenya diinferensi dari aplikasi Elysia di `api/`. Tidak ada kontrak API
 * yang ditulis ulang secara manual di frontend.
 */
type Api = NuxtApp['$api']
type DataOf<T> = T extends (...args: never[]) => Promise<{ data: infer D }> ? NonNullable<D> : never

export type MeResponse = DataOf<Api['v1']['auth']['me']['get']>
export type CurrentUser = MeResponse['user']
export type ActiveTenantContext = NonNullable<MeResponse['activeTenant']>
export type MembershipItem = DataOf<Api['v1']['memberships']['get']>['items'][number]
export type TenantDetail = DataOf<ReturnType<Api['v1']['tenants']>['get']>
export type AgentSummary = DataOf<Api['v1']['agents']['get']>['items'][number]
export type AgentDetail = DataOf<ReturnType<Api['v1']['agents']>['get']>
export type TaskItem = DataOf<Api['v1']['tasks']['get']>['items'][number]
export type TaskDetail = DataOf<ReturnType<Api['v1']['tasks']>['get']>
export type TaskRun = TaskItem['latestRun'] extends infer R | null ? NonNullable<R> : never
export type TaskCapabilities = DataOf<Api['v1']['tasks']['capabilities']['get']>
export type ApprovalItem = DataOf<Api['v1']['approvals']['get']>['items'][number]
export type RunOutput = DataOf<ReturnType<Api['v1']['runs']>['output']['get']>
