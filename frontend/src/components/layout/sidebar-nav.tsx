import { NavLink } from "react-router"
import {
  Activity,
  ClipboardList,
  Cpu,
  FileText,
  Gauge,
  History,
  ScrollText,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import type { UserRole } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { useAuth } from "@/features/auth/auth-provider"

type NavItem = {
  to: string
  label: string
  Icon: typeof Gauge
  /** Undefined = visible to every authenticated role. */
  requiresRole?: UserRole
  end?: boolean
}

type NavGroup = {
  /** Undefined = no heading; the group reads as the primary destinations. */
  heading?: string
  items: NavItem[]
}

/**
 * Grouped so the admin-only surface is visibly a separate concern rather than
 * eight flat links of equal weight. Staff simply never see the second group.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Operations",
    items: [
      { to: "/", label: "Command Center", Icon: Gauge, end: true },
      { to: "/incidents", label: "Incident History", Icon: History },
      { to: "/zones", label: "Zone Details", Icon: Activity },
      { to: "/reports", label: "Field Reports", Icon: FileText },
    ],
  },
  {
    // Not "Administration" — that is the name of a page inside this group, and
    // a heading that collides with one of its own links is ambiguous to read
    // and to query.
    heading: "Admin & system",
    items: [
      {
        to: "/system-health",
        label: "System Health",
        Icon: ShieldCheck,
        requiresRole: "ADMIN",
      },
      {
        to: "/admin",
        label: "Administration",
        Icon: ClipboardList,
        requiresRole: "ADMIN",
      },
      { to: "/simulator", label: "Simulator", Icon: Cpu, requiresRole: "ADMIN" },
      {
        to: "/audit-logs",
        label: "Audit Logs",
        Icon: ScrollText,
        requiresRole: "ADMIN",
      },
    ],
  },
  {
    items: [{ to: "/profile", label: "User Profile", Icon: UserRound }],
  },
]

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()

  // Hiding is a courtesy; the route guard and the backend are the enforcement.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.requiresRole || item.requiresRole === user?.role
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4 p-2">
      {groups.map((group, index) => (
        <div key={group.heading ?? `group-${index}`} className="flex flex-col gap-1">
          {group.heading && (
            <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {group.heading}
            </p>
          )}

          {group.items.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* A left rail on the active item: position carries the
                      selection as well as the fill does, which survives both
                      greyscale and a washed-out projector. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-colors",
                      isActive ? "bg-foreground" : "bg-transparent"
                    )}
                  />
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
