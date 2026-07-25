-- Hand-written migration: constraints Prisma's DSL cannot express.
--
-- 1) At most ONE active incident per zone.
--    This index *is* the no-duplicate-incident guarantee. Rapid oscillation
--    around the CRITICAL threshold, or two concurrent ingestion requests for
--    the same zone, cannot create a second OPEN/ACKNOWLEDGED incident because
--    Postgres refuses the insert. It must never be reduced to application
--    logic — the application only catches the violation and reports it.
CREATE UNIQUE INDEX IF NOT EXISTS "incident_one_active_per_zone"
  ON "Incident" ("zoneId")
  WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');

-- 2) Partial index for the hot "active incidents" scan used by the priority
--    queue and the dashboard summary.
CREATE INDEX IF NOT EXISTS "incident_active_started_at"
  ON "Incident" ("startedAt" DESC)
  WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');

-- 3) The 24-hour hot query ("all CRITICAL or active incidents from the last 24
--    hours across all zones") sorts by createdAt within status. The composite
--    from schema.prisma covers the predicate; this descending variant lets the
--    planner satisfy ORDER BY without a sort node.
CREATE INDEX IF NOT EXISTS "incident_status_created_at_desc"
  ON "Incident" ("status", "createdAt" DESC);
