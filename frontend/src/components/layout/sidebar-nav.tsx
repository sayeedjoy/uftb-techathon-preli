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

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Command Center", Icon: Gauge, end: true },
  { to: "/incidents", label: "Incident History", Icon: History },
  { to: "/zones", label: "Zone Details", Icon: Activity },
  { to: "/reports", label: "Field Reports", Icon: FileText },
  { to: "/system-health", label: "System Health", Icon: ShieldCheck, requiresRole: "ADMIN" },
  { to: "/admin", label: "Administration", Icon: ClipboardList, requiresRole: "ADMIN" },
  { to: "/simulator", label: "Simulator", Icon: Cpu, requiresRole: "ADMIN" },
  { to: "/audit-logs", label: "Audit Logs", Icon: ScrollText, requiresRole: "ADMIN" },
  { to: "/profile", label: "User Profile", Icon: UserRound },
]

export function SidebarNav() {
  const { user } = useAuth()

  // Hiding is a courtesy; the route guard and the backend are the enforcement.
  const items = NAV_ITEMS.filter(
    (item) => !item.requiresRole || item.requiresRole === user?.role
  )

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-2">
      {items.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end ?? false}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )
          }
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
