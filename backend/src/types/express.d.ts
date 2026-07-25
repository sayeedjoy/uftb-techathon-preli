import type { UserRole } from "@scsrg/shared"

/** Request augmentation used by the auth, RBAC and zone-key middleware. */
declare global {
  namespace Express {
    interface Request {
      requestId?: string
      /** Result of `validate({ query })`; Express 5's `req.query` is read-only. */
      validatedQuery?: unknown
      user?: {
        id: string
        email: string
        name: string
        role: UserRole
      }
      zone?: {
        id: string
        code: string
        name: string
        isActive: boolean
        maintenanceMode: boolean
      }
    }
  }
}

export {}
