import { ArrowDownLeft, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

export type InspectorEntry =
  | {
      id: string
      kind: "payload"
      zoneCode: string
      at: string
      body: unknown
    }
  | {
      id: string
      kind: "response"
      zoneCode: string
      at: string
      statusCode: number
      body: unknown
    }

function statusClass(status: number): string {
  if (status === 0) return "border-offline-border text-offline"
  if (status < 300) return "border-safe-border text-safe"
  if (status < 500) return "border-warning-border text-warning"
  return "border-critical-border text-critical"
}

/**
 * The raw wire, both directions.
 *
 * Rejections are shown verbatim with their real status code — the simulator
 * never masks a 400, 409 or 422, because those responses are the point of the
 * fault-injection demo.
 */
export function PayloadInspector({ entries }: { entries: InspectorEntry[] }) {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Payload inspector</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Raw request bodies and the backend&apos;s verbatim responses
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Nothing submitted yet. Start a zone or run a scenario.
        </p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-border/30 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {entry.kind === "payload" ? (
                  <ArrowUpRight aria-hidden className="size-3.5 text-info" />
                ) : (
                  <ArrowDownLeft
                    aria-hidden
                    className="size-3.5 text-violet-400"
                  />
                )}
                <span className="font-mono text-muted-foreground">
                  {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="font-mono">{entry.zoneCode}</span>
                <span className="text-muted-foreground">
                  {entry.kind === "payload" ? "request" : "response"}
                </span>
                {entry.kind === "response" && (
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono",
                      statusClass(entry.statusCode)
                    )}
                  >
                    HTTP {entry.statusCode || "network error"}
                  </span>
                )}
              </div>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
                {JSON.stringify(entry.body, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
