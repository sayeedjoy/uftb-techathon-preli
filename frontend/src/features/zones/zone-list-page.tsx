import { Card } from "@/components/ui/card"
import { ZoneCard } from "@/components/zones/zone-card"
import {
  useLiveDashboardSync,
  useZones,
} from "@/features/dashboard/use-dashboard-data"

export function ZoneListPage() {
  useLiveDashboardSync()
  const zones = useZones()

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Zone details</h1>
        <p className="text-sm text-muted-foreground">
          Select a zone to see its sensor history, transitions and
          configuration.
        </p>
      </header>

      {zones.isLoading && (
        <Card className="p-6 text-sm text-muted-foreground">
          Loading zones…
        </Card>
      )}

      {zones.error != null && (
        <Card
          role="alert"
          className="border-critical-border p-6 text-sm text-critical"
        >
          Could not load zones.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {zones.data?.map((zone) => (
          <ZoneCard key={zone.id} zone={zone} />
        ))}
      </div>
    </div>
  )
}
