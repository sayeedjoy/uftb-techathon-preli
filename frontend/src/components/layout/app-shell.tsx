import * as React from "react"
import { Link, Outlet, useLocation } from "react-router"
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Siren,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed"
import { ReportChat } from "@/features/reports/report-chat"
import { ConnectionBadge } from "./connection-badge"
import { SidebarNav } from "./sidebar-nav"
import { ThemeToggle } from "./theme-toggle"
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
      className="hidden font-mono text-sm text-muted-foreground tabular-nums sm:inline"
    >
      {now.toLocaleTimeString([], { hour12: false })}
    </time>
  )
}

/**
 * The brand block.
 *
 * `h-14` is load-bearing, not cosmetic: it matches the header's height exactly,
 * so the rule beneath it continues the header's bottom border into the sidebar
 * as one unbroken line. Padding-derived height put it ~10px low and the seam
 * was visible at every zoom level.
 */
function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2",
        collapsed ? "justify-center px-0" : "px-4"
      )}
    >
      <Siren aria-hidden className="size-5 shrink-0 text-critical" />
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-semibold">SCS-RG</p>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            Campus Safety Grid
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The command-centre chrome: a collapsible sidebar, a status-bearing top bar
 * and the routed page. Information-dense and quiet — the page content is what
 * should draw the eye, not the frame around it.
 *
 * Below `md` the sidebar collapses into a sheet. It is not simply hidden: an
 * operator on a phone still needs every destination, and a nav that disappears
 * at a breakpoint strands them on whatever page they happened to load.
 */
export function AppShell() {
  const { user, logout } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const location = useLocation()

  // Any navigation closes the sheet, including a browser back/forward that the
  // NavLink click handler never sees. Adjusted during render rather than in an
  // effect: React re-runs this component before committing, so the sheet never
  // paints open on the new route — an effect would show one frame of the old
  // state and cost a cascading render.
  const [renderedPath, setRenderedPath] = React.useState(location.pathname)
  if (renderedPath !== location.pathname) {
    setRenderedPath(location.pathname)
    setMobileNavOpen(false)
  }

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      <aside
        id="sidebar"
        data-collapsed={collapsed}
        className={cn(
          "hidden shrink-0 flex-col border-r border-border/60 transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-14" : "w-60"
        )}
      >
        <BrandMark collapsed={collapsed} />
        <Separator />
        <SidebarNav collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:gap-3 sm:px-4">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Open navigation"
                />
              }
            >
              <Menu aria-hidden className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Command centre destinations available to your role.
              </SheetDescription>
              <BrandMark />
              <Separator />
              <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* The collapse control lives in the header rather than the sidebar so
              it stays in one place in both states. */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            className="hidden md:inline-flex"
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden className="size-4" />
            )}
          </Button>

          <Link
            to="/"
            className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            aria-label="Command Center"
          >
            <Siren aria-hidden className="size-5 text-critical" />
            <span className="text-sm font-semibold">SCS-RG</span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ClockReadout />
            <ConnectionBadge />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <ThemeToggle />
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

        <main id="main-content" className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mounted on the shell, not a page: a report is something an operator
          needs to file *while* watching the grid, from wherever they are. */}
      <ReportChat />
    </div>
  )
}
