import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type DateBoundary = "start" | "end"

/**
 * A single date filter: shadcn `Popover` + `Calendar`.
 *
 * The value crossing this boundary is an ISO instant, because that is what the
 * API filters on — but the operator picks a *day*. `boundary` decides which
 * edge of that day the instant lands on, so "to: 3 March" includes everything
 * that happened on 3 March rather than nothing at all.
 */
export function DateField({
  id,
  label,
  value,
  boundary,
  onChange,
  disabled,
}: {
  id: string
  label: string
  /** ISO instant, or empty when unset. */
  value: string
  boundary: DateBoundary
  onChange: (isoValue: string) => void
  disabled?: (date: Date) => boolean
}) {
  const [open, setOpen] = React.useState(false)

  const selected = React.useMemo(() => {
    if (!value) return undefined
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }, [value])

  const commit = (date: Date | undefined) => {
    if (!date) {
      onChange("")
      setOpen(false)
      return
    }

    const bounded = new Date(date)
    if (boundary === "start") bounded.setHours(0, 0, 0, 0)
    else bounded.setHours(23, 59, 59, 999)

    onChange(bounded.toISOString())
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                id={id}
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start rounded-md font-normal",
                  !selected && "text-muted-foreground"
                )}
              />
            }
          >
            <CalendarIcon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">
              {selected ? format(selected, "d MMM yyyy") : "Any date"}
            </span>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selected}
              // Without this the calendar opens on the *current* month even
              // when the filter already holds a date, so editing "3 March"
              // starts in July and the operator has to page backwards.
              defaultMonth={selected}
              onSelect={commit}
              autoFocus
              {...(disabled ? { disabled } : {})}
            />
          </PopoverContent>
        </Popover>

        {selected && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => commit(undefined)}
            aria-label={`Clear ${label.toLowerCase()} date`}
            title={`Clear ${label.toLowerCase()} date`}
          >
            <X aria-hidden className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
