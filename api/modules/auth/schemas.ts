import { t } from 'elysia'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../core/auth/password'
import { TenantContextSchema, Timestamp, Uuid, UserSchema } from '../../shared/schemas'

const Email = t.String({ format: 'email', maxLength: 254, description: 'Alamat email' })
const Password = t.String({
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
  description: `Kata sandi ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter`,
})

export const RegisterBody = t.Object({
  email: Email,
  password: Password,
  displayName: t.String({ minLength: 1, maxLength: 120, description: 'Nama tampilan' }),
  companyName: t.Optional(
    t.String({
      minLength: 2,
      maxLength: 120,
      description: 'Nama perusahaan pertama (opsional); pengguna menjadi owner',
    }),
  ),
})

export const LoginBody = t.Object({
  email: Email,
  password: t.String({ minLength: 1, maxLength: PASSWORD_MAX_LENGTH }),
})

export const SessionResponse = t.Object(
  {
    user: UserSchema,
    session: t.Object({ expiresAt: Timestamp }),
    activeTenantId: t.Nullable(Uuid),
  },
  { title: 'SessionResponse' },
)

export const MeResponse = t.Object(
  {
    user: UserSchema,
    session: t.Object({ expiresAt: Timestamp }),
    activeTenant: t.Nullable(TenantContextSchema),
  },
  { title: 'MeResponse' },
)

export const LogoutResponse = t.Object({ revoked: t.Boolean() }, { title: 'LogoutResponse' })
