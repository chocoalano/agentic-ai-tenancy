/**
 * Test tipe: memastikan tipe request/response diinferensi end-to-end dari
 * Elysia ke Eden Treaty (bukan `any`). Diperiksa oleh `tsc -p
 * tsconfig.backend.json` (bagian dari `bun run typecheck`); `expectTypeOf`
 * tidak melakukan apa pun saat runtime.
 */
import { describe, expectTypeOf, test } from 'bun:test'
import type { treaty } from '@elysiajs/eden'
import type { Api } from '../../api/app'

type Client = ReturnType<typeof treaty<Api>>
type DataOf<T> = T extends (...args: never[]) => Promise<{ data: infer D }> ? NonNullable<D> : never
type ErrorOf<T> = T extends (...args: never[]) => Promise<{ error: infer E }> ? NonNullable<E> : never

describe('inferensi tipe Eden', () => {
  test('respons bukan any dan memiliki bentuk yang tepat', () => {
    type Agents = DataOf<Client['v1']['agents']['get']>
    expectTypeOf<Agents>().not.toBeAny()
    expectTypeOf<Agents['items'][number]['lifecycleStatus']>().toEqualTypeOf<
      'draft' | 'active' | 'paused' | 'archived'
    >()
    expectTypeOf<Agents['items'][number]['runtimeStatus']>().toEqualTypeOf<null>()
    expectTypeOf<Agents['items'][number]['createdAt']>().toEqualTypeOf<Date>()

    type Me = DataOf<Client['v1']['auth']['me']['get']>
    expectTypeOf<Me['user']['email']>().toEqualTypeOf<string>()
    expectTypeOf<NonNullable<Me['activeTenant']>['permissions'][number]>().toEqualTypeOf<
      'tenant.read' | 'tenant.manage' | 'members.read' | 'members.manage' | 'agents.read' | 'agents.manage'
    >()
  })

  test('body request bertipe', () => {
    type LoginBody = Parameters<Client['v1']['auth']['login']['post']>[0]
    expectTypeOf<LoginBody>().toEqualTypeOf<{ email: string; password: string }>()
  })

  test('error bertipe per status HTTP', () => {
    type AgentError = ErrorOf<ReturnType<Client['v1']['agents']>['get']>
    expectTypeOf<AgentError['status']>().toEqualTypeOf<401 | 403 | 404 | 422>()
    expectTypeOf<Extract<AgentError, { status: 404 }>['value']['code']>().toEqualTypeOf<string>()
  })
})
