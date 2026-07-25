import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type FilterOption = { value: string; label: string }

/**
 * A labelled `Select` for the filter bars.
 *
 * Wrapping it keeps the label association, the trigger sizing and the
 * "no filter" sentinel identical everywhere. An empty string cannot be the
 * sentinel — Base UI treats that as "nothing selected" and falls back to the
 * placeholder, so an explicit token is used and translated at the edge.
 */
export function FilterSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly FilterOption[]
  className?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next) => onValueChange(String(next))}
        items={options as FilterOption[]}
      >
        <SelectTrigger id={id} className={className ?? "h-9 w-full rounded-md"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
