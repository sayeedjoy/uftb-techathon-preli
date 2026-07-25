/**
 * Typed query-key factory.
 *
 * Every cache read, write and invalidation goes through here, so a socket
 * handler and a page component cannot disagree about which key holds what.
 */
export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  dashboard: {
    summary: () => ["dashboard", "summary"] as const,
  },
  zones: {
    all: () => ["zones"] as const,
    list: () => ["zones", "list"] as const,
    detail: (zoneId: string) => ["zones", "detail", zoneId] as const,
    readings: (zoneId: string, page: number) =>
      ["zones", "readings", zoneId, page] as const,
    transitions: (zoneId: string) => ["zones", "transitions", zoneId] as const,
    timeline: (zoneId: string) => ["zones", "timeline", zoneId] as const,
    systemHealth: (zoneId: string) => ["zones", "health", zoneId] as const,
  },
  incidents: {
    all: () => ["incidents"] as const,
    list: (filters: Record<string, unknown>) =>
      ["incidents", "list", filters] as const,
    active: () => ["incidents", "list", { active: true }] as const,
    detail: (incidentId: string) => ["incidents", "detail", incidentId] as const,
    timeline: (incidentId: string) =>
      ["incidents", "timeline", incidentId] as const,
  },
  priorityQueue: {
    all: () => ["priority-queue"] as const,
  },
  admin: {
    systemHealth: () => ["admin", "system-health"] as const,
    auditLogs: (filters: Record<string, unknown>) =>
      ["admin", "audit-logs", filters] as const,
    users: () => ["admin", "users"] as const,
  },
  simulator: {
    status: () => ["simulator", "status"] as const,
  },
  reports: {
    list: (status?: string) => ["reports", status ?? "all"] as const,
  },
} as const

/** The four snapshots refetched on every socket connect and reconnect. */
export const SNAPSHOT_QUERY_KEYS = [
  queryKeys.dashboard.summary(),
  queryKeys.zones.list(),
  queryKeys.incidents.active(),
  queryKeys.priorityQueue.all(),
] as const
