import * as React from "react"
import { Link, Outlet } from "react-router"
import { LogOut, Siren } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ConnectionBadge } from "./connection-badge"
import { SidebarNav } from "./sidebar-nav"
import { useAuth } from "@/features/auth/auth-provider"

function ClockReadout() {
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <time
      dateTime={now.toISOString()}
      className="font-mono text-sm tabular-nums text-muted-foreground"
    >
      {now.toLocaleTimeString([], { hour12: false })}
    </time>
  )
}

/**
 * The command-centre chrome: a persistent sidebar, a status-bearing top bar and
 * the routed page. Information-dense and quiet — the page content is what
 * should draw the eye, not the frame around it.
 */
export function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <Siren aria-hidden className="size-5 text-red-500" />
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold">SCS-RG</p>
            <p className="truncate text-xs text-muted-foreground">
              Campus Safety Grid
            </p>
          </div>
        </div>
        <Separator />
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 md:hidden"
            aria-label="Command Center"
          >
            <Siren aria-hidden className="size-5 text-red-500" />
            <span className="text-sm font-semibold">SCS-RG</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <ClockReadout />
            <ConnectionBadge />
            <Separator orientation="vertical" className="h-6" />
            <div className="hidden text-right sm:block">
              <p className="text-xs leading-tight font-medium">{user?.name}</p>
              <p className="text-[11px] leading-tight text-muted-foreground uppercase">
                {user?.role.replace("_", " ").toLowerCase()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
