import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export type RiskPoint = {
  at: string
  riskScore: number
}

/**
 * Risk progression over the life of an incident.
 *
 * Handles a single point and an empty series without crashing — a brand-new
 * incident has exactly one reading, and that must render rather than blow up.
 */
export function RiskHistoryChart({
  points,
  warningThreshold = 30,
  criticalThreshold = 65,
  height = 200,
}: {
  points: RiskPoint[]
  warningThreshold?: number
  criticalThreshold?: number
  height?: number
}) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No readings recorded for this window.
      </p>
    )
  }

  const data = points.map((point) => ({
    time: new Date(point.at).toLocaleTimeString([], { hour12: false }),
    risk: Number(point.riskScore.toFixed(2)),
  }))

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.12}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            opacity={0.5}
            minTickGap={32}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            opacity={0.5}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
            }}
          />
          {/* Thresholds are drawn so a reader can see *why* a state changed. */}
          <ReferenceLine
            y={warningThreshold}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: "WARNING", fontSize: 9, fill: "#f59e0b" }}
          />
          <ReferenceLine
            y={criticalThreshold}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: "CRITICAL", fontSize: 9, fill: "#ef4444" }}
          />
          <Line
            type="monotone"
            dataKey="risk"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={data.length <= 2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
