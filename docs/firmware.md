# Firmware — the ESP32 zone node

How a physical (or Wokwi-simulated) zone node fits the grid. Build and pin-out
instructions live in [`firmware/README.md`](../firmware/README.md); this
document covers the contract and the reasoning behind it.

The firmware arrived from a separate round-1 repository that shipped with its
own small Express server. That server accepted whatever the node sent —
including the node's own risk score and relay decision. It is gone. The node
now talks to `backend/` and nothing else, which is what made the merge a
transport rewrite rather than a file copy.

## Where the node sits

```
ESP32 zone node                       backend (sole authority)
  sample sensors  ──raw readings──▶   validate → fuse risk → classify state
  drive actuators ◀──commands─────    resolve desired actuation, diff, dispatch
  report COMPLETED ──────────────▶    mark executed
```

The node is a sensor and a pair of hands. Every judgement — is this a hazard,
how bad, does it open an incident, what should the relay do — belongs to the
backend. Nothing about that changes when the node is simulated.

## Wire contract

Four routes, all under `/api/v1/ingestion/zones/:zoneId`, all authenticated by
the zone's own API key in `x-zone-api-key`. A dashboard JWT cannot satisfy
`requireZoneApiKey`, and the zone key never reaches a browser.

| Method | Path                            | Body                                     |
| ------ | ------------------------------- | ---------------------------------------- |
| POST   | `/readings`                     | `sensorReadingSchema`                    |
| POST   | `/heartbeat`                    | `{ sentAt? }` — **strict**, nothing else |
| GET    | `/commands`                     | —                                        |
| POST   | `/commands/:commandId/complete` | `{ status, message? }`                   |

Both schemas live in
[`packages/shared/src/schemas/sensor-reading.schema.ts`](../packages/shared/src/schemas/sensor-reading.schema.ts).
Change the shape there first, never in the firmware alone — that file is the
contract both ends compile against.

### What the node may send

```jsonc
{
  "readingId": "esp32-iot-lab-1A2B3C4D-1785046446", // globally unique
  "sequenceNumber": 1785046446, // monotonic per zone
  "capturedAt": "2026-07-26T06:14:06Z",
  "sensors": {
    "fireDetected": false,
    "gasLevel": 0.02, // 0..1, not ppm
    "waterLevel": 0.0, // 0..1, not percent
    "occupancyDetected": true, // or null when the sensor is unavailable
  },
  "sensorHealth": { "node": { "available": false, "message": "…" } },
}
```

Anything else is rejected. `sensorValuesSchema` is `.strict()` specifically so
that a node supplying `riskScore`, `state` or `relay_on` gets a `400` instead
of having the field quietly dropped — silent stripping would let a
misconfigured node believe it was being obeyed.

### Rejections the firmware expects

| Status | Code                    | Cause                                    |
| ------ | ----------------------- | ---------------------------------------- |
| `400`  | `VALIDATION_ERROR`      | unknown key, missing field, wrong type   |
| `422`  | `VALUE_OUT_OF_RANGE`    | `gasLevel` outside 0..1, timestamp skew  |
| `422`  | `SENSOR_NOT_CONFIGURED` | channel the zone has no sensor row for   |
| `401`  | —                       | wrong or missing zone key                |
| `409`  | `DUPLICATE_READING`     | `readingId` or sequence already recorded |

The node logs `error.code` and `error.message` verbatim to serial. These are
the most useful diagnostics it ever receives, and the body says exactly which
field is at fault.

## Unit conversion

The board reads ppm and percent; the contract carries normalised levels. The
backend rejects out-of-range values rather than clamping them, so saturation
happens on the device where the calibration constants are:

| Channel | Device units          | Wire        | Constant                    |
| ------- | --------------------- | ----------- | --------------------------- |
| Gas     | 200–10000 ppm         | 0..1        | `GAS_REPORT_FULL_SCALE_PPM` |
| Water   | 0–100 %               | 0..1        | —                           |
| Flame   | active-low digital    | boolean     | `IR_FLAME_HOLD_MS` latch    |
| PIR     | digital, or timed out | bool / null | `SENSOR_TIMEOUT_MS`         |

Fire debounce (`FIRE_DEBOUNCE_CONSECUTIVE`) and gas warm-up (`GAS_WARMUP_MS`)
are **backend** concerns. The node reports the raw line every publish interval
and lets the backend decide when a flicker becomes a fire — the same debounce
that scenario 2 exercises.

## Sequence numbering

`sequenceNumber` is unique per zone for all time and must never decrease:
`ordering.service.ts` rejects anything below the zone's latest accepted
reading. A counter restarting at `1` on every boot would put a node
permanently below its own history — every subsequent reading rejected, with no
way out short of a database edit.

The node therefore anchors the counter to the wall clock the first time NTP
returns a plausible time, and publishes nothing before then. This is the same
approach `backend/scripts/run-load.ts` takes for the same reason. Epoch seconds
fit the backend's 32-bit signed column until 2038.

`readingId` is globally unique, not per-zone, so it carries node id, boot id and
sequence.

## Actuation and the fallback boundary

Desired actuator state is a pure function of zone state
([`actuation.resolver.ts`](../backend/src/modules/actuation/actuation.resolver.ts)),
diffed so that a zone sitting in `CRITICAL` emits one buzzer command rather than
one per reading.

`relayCutoff` is the field to read carefully: `ACTIVATE_RELAY` means _cut the
power_, so it drives `PIN_RELAY` **LOW**. The firmware inverts it explicitly and
says so at the call site.

`OFFLINE` deliberately leaves the buzzer and relay untouched and changes only
the LED, to an amber pulse. Losing contact with a zone is not evidence the
hazard ended, so silencing an alarm because a node stopped reporting would be
exactly the wrong behaviour.

The node mirrors that principle from its own side. After
`BACKEND_AUTHORITY_GRACE_MS` without a successful call it stops obeying stale
commands and its local state machine resumes control of the pins. Set that
grace period above `ZONE_OFFLINE_TIMEOUT_MS` so the two views agree: by the
time the node takes over, the backend has already marked the zone `OFFLINE` and
shown it as such on the dashboard.

This is the one place on-device risk scoring still matters. It is advisory,
never transmitted, and only ever decides what a disconnected node does with its
own buzzer.

## Resilience

- **Persistent outbox** — up to `OUTBOX_CAPACITY` readings survive a reboot in
  NVS, checksummed with FNV-1a. Written only when a send fails, to limit flash
  wear during normal two-second publishing.
- **Exponential backoff** with jitter after a failed call, capped at
  `BACKEND_MAX_RETRY_MS`.
- **Task watchdog** at `WATCHDOG_TIMEOUT_SECONDS`.
- **Sensor timeout** — no fresh sample within `SENSOR_TIMEOUT_MS` and the node
  reports occupancy as unknown and flags `sensorHealth`, rather than reporting
  a stale value as current.

## Testing without hardware

The Wokwi diagram is the fastest path, but the backend does not care what is on
the other end of the socket. `pnpm sim:scenario -- --id 2` drives the same
routes from the server using server-held keys, and
`pnpm sim:load -- --zones 30 --hz 5` exercises them at volume. Use those to
test backend behaviour; use the firmware to test the firmware.
