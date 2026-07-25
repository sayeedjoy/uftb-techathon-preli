import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import type { AuditLogDto, PaginationMeta } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { request } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

export function AuditLogPage() {
  const [action, setAction] = React.useState("")
  const [entityType, setEntityType] = React.useState("")
  const [page, setPage] = React.useState(1)

  const filters = { action, entityType, page }

  const logs = useQuery({
    queryKey: queryKeys.admin.auditLogs(filters),
    queryFn: () =>
      request<{ logs: AuditLogDto[] }>("/admin/audit-logs", {
        query: { action, entityType, page, pageSize: 25 },
      }),
  })

  const meta = logs.data?.meta as PaginationMeta | undefined

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Audit logs</h1>
        <p className="text-sm text-muted-foreground">
          Every acknowledgment, override and configuration change, with who did
          it and from where.
        </p>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            value={action}
            placeholder="INCIDENT_ACKNOWLEDGED"
            onChange={(event) => {
              setAction(event.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-entity">Entity type</Label>
          <Input
            id="audit-entity"
            value={entityType}
            placeholder="Zone"
            onChange={(event) => {
              setEntityType(event.target.value)
              setPage(1)
            }}
          />
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Entity</th>
              <th className="px-4 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {logs.data?.data.logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-2 text-xs">
                  {new Date(log.createdAt).toLocaleString([], { hour12: false })}
                </td>
                <td className="px-4 py-2">{log.userName ?? "system"}</td>
                <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-2 text-xs">
                  {log.entityType}
                  {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                  {log.ipAddress ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.isLoading && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Loading audit entries…
          </p>
        )}
        {!logs.isLoading && (logs.data?.data.logs.length ?? 0) === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No audit entries match these filters.
          </p>
        )}
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} entries
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasNextPage}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
