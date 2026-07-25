# Data retention and backup

## Policy

| Data                          | Retention  | Then                                                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------- |
| Raw sensor readings           | 90 days    | Rolled into hourly aggregates, raw rows purged                          |
| Hourly aggregates             | Indefinite | Small enough to keep; sufficient for trend charts                       |
| Incidents and their timelines | Indefinite | This is the audit trail — the record of what happened and who responded |
| Actuation commands            | Indefinite | Paired with the incidents that caused them                              |
| Audit logs                    | Indefinite | Security-relevant by definition                                         |
| System events                 | 90 days    | Operational noise beyond that window                                    |

Raw readings dominate the volume — 30 zones at 5 Hz is roughly 13 million rows a
day — and their value decays fast. An incident from last March still matters;
the individual readings behind it do not once the peak, the contributions and
the timeline are recorded on the incident itself.

## Access

| Role             | Sees                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `SECURITY_STAFF` | Incident summaries, timelines, zone state and history                 |
| `ADMIN`          | The above, plus raw historical readings, system health and audit logs |

`GET /zones/:zoneId/readings` returns `403` for a staff token. The zone detail
page shows staff the summarised view and says so, rather than rendering an empty
chart.

## Running retention

```bash
pnpm --filter backend retention              # dry run — the default
pnpm --filter backend retention -- --apply   # write aggregates, then purge
```

Dry-run by default, and **not scheduled**. Deleting history should be a
deliberate act, not something a prototype does to itself overnight. In a real
deployment this would run nightly from cron or a scheduled container, with the
dry-run output monitored for a week first.

The job writes an hourly `ReadingHourlyAggregate` row per zone-hour
(count, average and maximum risk, average gas and water, fire-reading count)
before deleting the raw rows it summarised. Incidents are never touched.

## Backup

```bash
pnpm db:backup
```

Produces a timestamped custom-format `pg_dump` under `backups/` (gitignored) and
prints the restore command:

```bash
createdb scsrg_restore
pg_restore --no-owner \
  --dbname=postgresql://scsrg:scsrg@localhost:5433/scsrg_restore \
  backups/scsrg-<timestamp>.dump
```

If `pg_dump` is not on the PATH, the container has it:

```bash
docker compose exec -T postgres pg_dump -U scsrg scsrg > backup.sql
```

### Recovery process

1. Stop the backend so nothing writes during the restore.
2. Restore the most recent dump into a **scratch** database first and inspect it
   — never restore straight over a live database you have not verified.
3. Confirm the row counts and the newest `Incident.createdAt` look right.
4. Point `DATABASE_URL` at the restored database, or rename it into place.
5. Start the backend. Bootstrap reconstructs zone states, open incidents and the
   priority queue from whatever was restored, and re-derives `OFFLINE` from
   `lastSeenAt` — so zones quiet during the outage come back `OFFLINE`, not
   `SAFE`.

### Data-loss window

With daily backups the worst case is **24 hours** of readings, incidents and
audit entries.

That is a deliberate prototype-scale choice, and it is not what you would ship.
For a real deployment the honest options are:

- **Point-in-time recovery** via WAL archiving — loss measured in seconds,
  at the cost of running an archive target.
- **Streaming replication** to a standby — near-zero loss, at the cost of a
  second server.

The reading stream is the part that hurts least to lose: it is high-volume,
low-individual-value, and the incidents derived from it are what an
investigation actually needs. Sizing the recovery objective around incident
data rather than raw readings is the right trade for this system.
