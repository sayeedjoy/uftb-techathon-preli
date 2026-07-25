# API

Base path `/api/v1`. Interactive documentation with live examples:
**`http://localhost:4000/api/v1/docs`**. The machine-readable document is at
`/api/v1/openapi.json` and can be emitted with `pnpm docs:openapi`.

## Envelope

Every response, without exception:

```json
{ "success": true, "data": { }, "meta": { } }
```

```json
{
  "success": false,
  "error": {
    "code": "VALUE_OUT_OF_RANGE",
    "message": "Gas level must be between 0 and 1 — received 1.5.",
    "details": [{ "path": "sensors.gasLevel", "message": "Value outside the 0–1 range" }]
  }
}
```

`meta` carries pagination on list endpoints: `page`, `pageSize`, `total`,
`totalPages`, `hasNextPage`.

## Status codes

| Code | Meaning here |
|---|---|
| `200` | OK |
| `201` | Created — including an accepted sensor reading |
| `400` | Malformed input. Wrong shape, wrong types, or a forbidden field |
| `401` | Unauthenticated, or an invalid/revoked zone key |
| `403` | Authenticated but not permitted, or a deactivated zone |
| `404` | Not found |
| `409` | Conflict — duplicate reading, already acknowledged |
| `413` | Body over the 1 MB limit |
| `422` | Valid shape, impossible values |
| `429` | Rate limited |
| `500` | Unexpected |

The `400` / `422` distinction is load-bearing. `{"gasLevel": "high"}` is the
wrong *shape* — 400. `{"gasLevel": 1.5}` is the right shape carrying an
impossible *value* — 422. They mean different things to whoever is debugging a
node.

## Error codes

`VALIDATION_ERROR` · `UNAUTHENTICATED` · `INVALID_CREDENTIALS` · `FORBIDDEN` ·
`NOT_FOUND` · `DUPLICATE_READING` · `ALREADY_ACKNOWLEDGED` ·
`VALUE_OUT_OF_RANGE` · `SENSOR_NOT_CONFIGURED` · `INVALID_TIMESTAMP` ·
`ZONE_INACTIVE` · `INVALID_ZONE_KEY` · `RATE_LIMITED` · `CONFLICT` ·
`PAYLOAD_TOO_LARGE` · `INTERNAL_ERROR`

## Endpoints

### Auth

| Method & path | Auth | Notes |
|---|---|---|
| `POST /auth/login` | public | Rate-limited 5/min/IP. Returns token + user. |
| `GET /auth/me` | JWT | Current user and role. |

### Zones

| Method & path | Auth | Notes |
|---|---|---|
| `GET /zones` | JWT | **All** zone statuses in one request. |
| `GET /zones/:zoneId` | JWT | Detail incl. configuration. Accepts an id *or* a code (`iot-lab`). |
| `GET /zones/:zoneId/readings` | **ADMIN** | Paginated, date-filterable raw history. |
| `GET /zones/:zoneId/timeline` | JWT | Transitions and incidents merged. |
| `GET /zones/:zoneId/transitions` | JWT | State-change history. |
| `GET /zones/:zoneId/system-health` | **ADMIN** | Per-zone connectivity. |

### Ingestion — zone API key only

| Method & path | Notes |
|---|---|
| `POST /ingestion/zones/:zoneId/readings` | The full pipeline. Returns the backend's own verdict. |
| `POST /ingestion/zones/:zoneId/heartbeat` | Liveness without a reading. |
| `GET /ingestion/zones/:zoneId/commands` | Pending actuation commands. |
| `POST /ingestion/zones/:zoneId/commands/:commandId/complete` | Confirm execution. |

**Request** — raw values only:

```json
{
  "readingId": "iot-lab-1042",
  "sequenceNumber": 1042,
  "capturedAt": "2026-07-25T10:30:15.000Z",
  "sensors": {
    "fireDetected": true,
    "gasLevel": 0.72,
    "waterLevel": 0,
    "occupancyDetected": true
  }
}
```

A payload containing `riskScore`, `state`, `priority` or `incidentStatus` is
**rejected with 400**, not silently stripped. `occupancyDetected: null` means
the sensor is unavailable — never send `false` to mean "unknown".

**Response** — the backend's verdict, returned so a node or the simulator can
display what the system actually decided:

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "readingId": "iot-lab-1042",
    "validationStatus": "ACCEPTED",
    "appliedToLiveState": true,
    "computation": {
      "riskScore": 72.5,
      "state": "CRITICAL",
      "contributions": { "fire": 40, "gas": 17.5, "water": 0, "occupancy": 15 },
      "reasons": [
        "Sustained flame confirmed after debounce (5 consecutive readings) (+40)",
        "Gas level is 70% of configured range (+17.5)",
        "Zone is currently occupied (+15)",
        "Combined score crosses the CRITICAL threshold (65)"
      ]
    },
    "zoneState": "CRITICAL",
    "incidentId": "8c1…",
    "actuationCommandIds": ["a1…", "b2…", "c3…"]
  }
}
```

A stale reading returns `201` with `validationStatus: "ACCEPTED_OUT_OF_ORDER"`
and `appliedToLiveState: false` — stored for audit, barred from moving live
state, creating a transition, opening an incident or issuing actuation.

### Incidents

| Method & path | Auth | Notes |
|---|---|---|
| `GET /incidents` | JWT | Filters: `from`, `to`, `zoneId`, `status`, `active`, `hazardType`, `acknowledgedBy`; paginated. |
| `GET /incidents/:incidentId` | JWT | Detail with timeline, surrounding readings and actuation. `404` on unknown id. |
| `GET /incidents/:incidentId/timeline` | JWT | Ordered events. |
| `POST /incidents/:incidentId/acknowledge` | JWT | `200` / `409`. Optional `note`. |

### Priority and dashboard

| Method & path | Auth | Notes |
|---|---|---|
| `GET /priority-queue` | JWT | Ranked active incidents **with breakdown and reasons**. Empty is `[]`, never `null`. |
| `GET /dashboard/summary` | JWT | Everything the top summary bar needs, in one request. |

### Admin — all `ADMIN`

| Method & path | Notes |
|---|---|
| `POST /admin/zones` | Returns the plaintext API key **once**. |
| `PATCH /admin/zones/:zoneId` | Update; `isActive: false` is the only removal path. |
| `POST /admin/zones/:zoneId/credentials` | Rotate the API key; revokes the previous one. |
| `POST /admin/zones/:zoneId/overrides` | Requires a `reason` of ≥ 5 characters. |
| `PATCH /admin/sensors/:sensorId` | Sensor configuration and status. |
| `GET /admin/system-health` | Full health picture. |
| `GET /admin/audit-logs` | Paginated, filterable. |
| `GET /admin/users` · `PATCH /admin/users/:userId/role` | Role management; the last admin cannot demote themselves. |

### Simulator — all `ADMIN`

`GET /simulator/status` · `POST /simulator/zones/:zoneId/start` · `/stop` ·
`PATCH /simulator/zones/:zoneId/state` · `POST /simulator/zones/:zoneId/fault` ·
`POST /simulator/scenarios/:scenarioId/run` · `POST /simulator/stop-all`

### Reports (bonus 3)

| Method & path | Auth | Notes |
|---|---|---|
| `POST /reports/natural-language` | JWT | Deterministic extraction. Result is `PENDING` and influences nothing. |
| `GET /reports` | JWT | List, filterable by status. |
| `POST /reports/:reportId/confirm` | **ADMIN** | Only now can it contribute a bounded priority bonus. |
| `POST /reports/:reportId/reject` | **ADMIN** | |

### Advisory (bonuses 1 and 2)

| Method & path | Auth | Notes |
|---|---|---|
| `GET /trend/:zoneId` | JWT | Moving average and slope. Never affects state. |
| `GET /prediction/:zoneId` | JWT | P(CRITICAL within 60s). Cannot actuate. |

### Health

`GET /health` (liveness) · `GET /health/ready` (readiness incl. database).
Both are outside the versioned prefix and outside rate limits, so an
orchestrator probe can never be throttled.

## Real-time events

Socket.IO at `/socket.io`, JWT-authenticated in the handshake (`auth.token`).
An unauthenticated handshake is refused.

Rooms: `dashboard` (all authenticated clients), `zone:<zoneId>` (detail views),
`admin` (admin-only payloads such as simulator traffic).

Server → client: `zone:updated` · `zone:state-changed` · `reading:accepted` ·
`incident:created` · `incident:updated` · `incident:acknowledged` ·
`incident:resolved` · `priority:updated` · `sensor:offline` · `system:health` ·
`actuation:command` · `simulator:payload` · `simulator:response` ·
`simulator:status` · `trend:updated` · `prediction:updated` · `report:created`

Every payload carries `{ eventId, emittedAt, ...data }`. Sockets are never the
only source of truth: on connect and every reconnect the dashboard refetches
`/dashboard/summary`, `/zones`, `/incidents?active=true` and `/priority-queue`.
