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
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { to, label, Icon, end } = item

  const link = (
    <NavLink
      to={to}
      end={end ?? false}
      onClick={onNavigate}
      // The label is the accessible name in both states; collapsing the rail
      // must not cost a screen-reader user the destination name.
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center rounded-md py-2 text-sm font-medium transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          collapsed ? "justify-center px-0" : "gap-2.5 px-3",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* A left rail on the active item: position carries the selection as
              well as the fill does, which survives both greyscale and a
              washed-out projector. */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-colors",
              isActive ? "bg-foreground" : "bg-transparent"
            )}
          />
          <Icon aria-hidden className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  // Collapsed, the icon is the only cue, so the label has to be recoverable on
  // hover and on keyboard focus — which is what the tooltip trigger gives.
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { user } = useAuth()

  // Hiding is a courtesy; the route guard and the backend are the enforcement.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.requiresRole || item.requiresRole === user?.role
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <TooltipProvider delay={200}>
      <nav
        aria-label="Main navigation"
        className={cn("flex flex-col gap-4 p-2", collapsed && "items-stretch")}
      >
        {groups.map((group, index) => (
          <div
            key={group.heading ?? `group-${index}`}
            className="flex flex-col gap-1"
          >
            {group.heading &&
              (collapsed ? (
                // The heading text cannot fit, but the grouping still should
                // be visible — a rule says "these belong together" in the space
                // a word would need.
                index > 0 && <Separator className="mb-2" />
              ) : (
                <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {group.heading}
                </p>
              ))}

            {group.items.map((item) => (
              <NavItemLink
                key={item.to}
                item={item}
                collapsed={collapsed}
                {...(onNavigate ? { onNavigate } : {})}
              />
            ))}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  )
}
