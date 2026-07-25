import { LogOut, ShieldCheck, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/features/auth/auth-provider"

const CAPABILITIES = {
  SECURITY_STAFF: [
    "View every zone, the priority queue and incident history",
    "Acknowledge incidents",
    "Submit natural-language field reports",
  ],
  ADMIN: [
    "Everything security staff can do",
    "Issue manual overrides",
    "Manage zones, sensors and user roles",
    "View raw sensor history, system health and audit logs",
    "Drive the simulator and demonstration scenarios",
  ],
} as const

export function ProfilePage() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">User profile</h1>
      </header>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <UserRound aria-hidden className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium tracking-wide uppercase">
            <ShieldCheck aria-hidden className="size-3.5" />
            {user.role.replace("_", " ").toLowerCase()}
          </span>
        </div>

        <div>
          <h2 className="mb-1.5 text-sm font-semibold">
            What this role can do
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {CAPABILITIES[user.role].map((capability) => (
              <li key={capability}>· {capability}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Permissions are enforced by the backend. Hidden navigation is a
          convenience — a direct API call from an unauthorised role is refused
          regardless.
        </p>

        <Button variant="outline" onClick={logout} className="self-start">
          <LogOut aria-hidden className="size-4" />
          Sign out
        </Button>
      </Card>
    </div>
  )
}
