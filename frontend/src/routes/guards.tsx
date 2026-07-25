import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"
import { ShieldAlert } from "lucide-react"
import type { UserRole } from "@scsrg/shared"

import { useAuth } from "@/features/auth/auth-provider"

function RestoringSession() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <p className="text-sm text-muted-foreground">Restoring your session…</p>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isRestoring } = useAuth()
  const location = useLocation()

  if (isRestoring) return <RestoringSession />

  if (!isAuthenticated) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

/**
 * Route-level role guard.
 *
 * Deep-linking to an admin route as security staff must not render it — hiding
 * the nav item is not enough. The backend refuses the underlying calls
 * regardless; this only keeps the UI honest.
 */
export function RequireRole({
  role,
  children,
}: {
  role: UserRole
  children: ReactNode
}) {
  const { user, isRestoring } = useAuth()

  if (isRestoring) return <RestoringSession />

  if (user?.role !== role) {
    return (
      <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert aria-hidden className="size-10 text-amber-500" />
        <h1 className="text-lg font-semibold">Restricted area</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This page is available to administrators only. Your account has the{" "}
          <span className="font-medium">{user?.role ?? "unknown"}</span> role.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
