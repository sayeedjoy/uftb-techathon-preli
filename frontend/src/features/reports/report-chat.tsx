import * as React from "react"
import { Link } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MessageSquarePlus, SendHorizonal, ShieldCheck, X } from "lucide-react"
import type { IncidentReportDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { ReportReply } from "./report-reply"

/**
 * The floating field-report bar (bonus 4).
 *
 * Docked to the shell rather than living on one page: a guard who smells gas is
 * looking at the zone grid, not at `/reports`, and making them navigate away
 * from the live picture to say so is the wrong trade.
 *
 * Deliberately **non-modal** — no focus trap, no backdrop. An operator must be
 * able to keep watching the dashboard, and the critical banner behind it, while
 * they type. Escape closes it and focus returns to the launcher.
 *
 * The transcript is session state, not a cache. It is a record of what *this*
 * operator just submitted; `/reports` remains the durable, shared list.
 */

const MIN_LENGTH = 10
const MAX_LENGTH = 1000

type ChatEntry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "reply"; report: IncidentReportDto }
  | { id: string; kind: "error"; text: string }

export function ReportChat() {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [entries, setEntries] = React.useState<ChatEntry[]>([])

  const queryClient = useQueryClient()
  const launcherRef = React.useRef<HTMLButtonElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const transcriptRef = React.useRef<HTMLDivElement>(null)

  const append = (entry: ChatEntry) =>
    setEntries((previous) => [...previous, entry])

  const submit = useMutation({
    mutationFn: (value: string) =>
      apiPost<{ report: IncidentReportDto }>("/reports/natural-language", {
        text: value,
      }),
    onSuccess: (result) => {
      append({ id: crypto.randomUUID(), kind: "reply", report: result.report })
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() })
    },
    onError: (error) =>
      append({
        id: crypto.randomUUID(),
        kind: "error",
        text:
          error instanceof ApiError
            ? error.message
            : "The report could not be submitted. Check your connection and try again.",
      }),
  })

  const trimmed = text.trim()
  const tooShort = trimmed.length < MIN_LENGTH
  const canSend = !tooShort && !submit.isPending

  function send() {
    if (!canSend) return
    append({ id: crypto.randomUUID(), kind: "user", text: trimmed })
    submit.mutate(trimmed)
    setText("")
  }

  // Focus follows the panel in both directions: opening lands the caret in the
  // input, closing returns it to the launcher rather than to the top of the
  // page. Guarded against the mount run — this component is on every route, and
  // an unguarded effect would yank focus to the launcher on every page load.
  const hasOpened = React.useRef(false)
  React.useEffect(() => {
    if (open) {
      hasOpened.current = true
      inputRef.current?.focus()
    } else if (hasOpened.current) {
      launcherRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  // Scroll the transcript container itself rather than calling scrollIntoView,
  // which can scroll the dashboard behind the panel out from under the operator.
  React.useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript) transcript.scrollTop = transcript.scrollHeight
  }, [entries, submit.isPending])

  if (!open) {
    return (
      <Button
        ref={launcherRef}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls="report-chat-panel"
        className="fixed right-4 bottom-4 z-40 shadow-lg sm:right-6 sm:bottom-6"
      >
        <MessageSquarePlus aria-hidden className="size-4" />
        Report what you see
      </Button>
    )
  }

  return (
    <div
      id="report-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="report-chat-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false)
      }}
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[min(32rem,80svh)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="min-w-0">
          <h2
            id="report-chat-title"
            className="text-sm leading-tight font-semibold"
          >
            Field report
          </h2>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            Plain language, any language
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          aria-label="Close field report"
          className="ml-auto"
        >
          <X aria-hidden className="size-4" />
        </Button>
      </header>

      <div
        ref={transcriptRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
        aria-live="polite"
        aria-busy={submit.isPending}
      >
        {entries.length === 0 && (
          <div className="rounded-lg rounded-bl-sm border border-border/60 bg-card px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              Describe what you saw and where. The backend extracts a zone,
              hazard and severity, then waits for a supervisor.
            </p>
            <p className="mt-1.5 text-muted-foreground/80">
              For example: “Smell of gas near the soldering bench in the IoT
              Lab, not sure how bad.”
            </p>
          </div>
        )}

        {entries.map((entry) =>
          entry.kind === "user" ? (
            <p
              key={entry.id}
              className="max-w-[85%] self-end rounded-lg rounded-br-sm bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground"
            >
              {entry.text}
            </p>
          ) : entry.kind === "reply" ? (
            <ReportReply key={entry.id} report={entry.report} />
          ) : (
            <p
              key={entry.id}
              role="alert"
              className="rounded-lg rounded-bl-sm border border-critical-border bg-critical-surface px-3 py-2 text-xs leading-relaxed text-critical"
            >
              {entry.text}
            </p>
          )
        )}

        {submit.isPending && (
          <p className="rounded-lg rounded-bl-sm border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
            Extracting…
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 px-3 py-2.5">
        <label htmlFor="report-chat-input" className="sr-only">
          Describe what you observed
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id="report-chat-input"
            ref={inputRef}
            rows={2}
            value={text}
            maxLength={MAX_LENGTH}
            aria-describedby="report-chat-hint"
            onChange={(event) => setText(event.target.value)}
            // Enter sends, Shift+Enter breaks the line — the convention every
            // operator already has from every other chat box.
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder="Smell of gas near the IoT Lab bench…"
            className="max-h-28 min-h-16 resize-none text-xs"
          />
          <Button
            size="icon"
            onClick={send}
            disabled={!canSend}
            aria-label="Send report"
          >
            <SendHorizonal aria-hidden className="size-4" />
          </Button>
        </div>

        <p
          id="report-chat-hint"
          className={cn(
            "mt-1.5 text-[11px]",
            tooShort && trimmed.length > 0
              ? "text-warning"
              : "text-muted-foreground"
          )}
        >
          {tooShort && trimmed.length > 0
            ? `${MIN_LENGTH - trimmed.length} more characters needed`
            : "Enter sends · Shift+Enter for a new line"}
        </p>

        <p className="mt-2 flex items-start gap-1.5 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-px size-3 shrink-0" />
          <span>
            Advisory only. A report cannot open an incident, change a zone state
            or trigger an actuator.{" "}
            <Link
              to="/reports"
              onClick={() => setOpen(false)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              All reports
            </Link>
          </span>
        </p>
      </div>
    </div>
  )
}
