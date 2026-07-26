# SCS-RG firmware — ESP32 sensor node

An ESP32 zone node for the SCS-RG grid. It samples flame, gas, water and
occupancy, posts **raw** readings to the backend, and drives its LEDs, buzzer
and relay from the actuation commands the backend sends back.

Runs on real hardware or in [Wokwi](https://wokwi.com) against
[diagram.json](diagram.json) — the simulated board speaks the same HTTP API as
a physical one.

---

## The one rule this firmware exists to respect

**A sensor node is never trusted with a computed value.**

This node still computes a local risk score and safety state, but that number
never crosses the wire. The payload carries raw sensor values only:

```jsonc
{
  "readingId": "esp32-iot-lab-1A2B3C4D-1785046446",
  "sequenceNumber": 1785046446,
  "capturedAt": "2026-07-26T06:14:06Z",
  "sensors": {
    "fireDetected": false, // raw flame line; the backend debounces it
    "gasLevel": 0.02, // normalised 0..1, not ppm
    "occupancyDetected": true,
  },
}
```

`sensorValuesSchema` is `.strict()`, so a stray `riskScore`, `state` or
`relay_on` is not ignored — it is a `400`. Shape errors are `400`, values that
are merely impossible (a `gasLevel` of `42`) are `422`. Both are logged in full
to the serial console, because the rejection body names the offending field.

The local risk score survives for exactly one purpose: deciding what the alarms
do when the backend is unreachable. See **Who owns the actuators** below.

---

## Setup

### 1. Have the backend running

```bash
pnpm db:up && pnpm db:seed && pnpm dev     # from the repository root
```

### The three zones

One firmware, three boards. Each zone carries only the sensors it has a row
for in the database, because reporting a channel the zone lacks is a
`422 SENSOR_NOT_CONFIGURED`.

| Zone           | Sensors                       | Hazard profile                                  |
| -------------- | ----------------------------- | ----------------------------------------------- |
| `iot-lab`      | flame · gas · occupancy       | Soldering fire, flux fumes, high occupancy      |
| `robotics-lab` | flame · gas · occupancy       | Fabrication fire, battery off-gassing           |
| `server-room`  | flame · **water** · occupancy | Electrical fire, AC condensate leak, high asset |

Per-zone circuit diagrams live in [`zones/<code>/diagram.json`](zones).
Switching zone rewrites both `include/zone_secrets.h` and the active
`diagram.json`, so credentials and board can never drift apart:

```bash
pnpm firmware:config -- server-room --write
cd firmware && pio run
```

### 2. Generate the zone identity

The backend addresses zones by UUID and authenticates with the zone's own API
key. Both change on every `pnpm db:seed`, so generate them rather than copying
by hand:

```bash
pnpm firmware:config -- --write              # iot-lab
pnpm firmware:config -- server-room --write  # any seeded zone
pnpm firmware:config                         # print without writing
```

That writes [include/zone_secrets.h](include/zone_secrets.example.h) — which is
**gitignored**, so a live API key never lands in a tracked file — and derives
the `REPORT_*` flags from the sensors that zone actually has.

### 3. Build

```bash
cd firmware
pio run                # or: python -m platformio run
```

### 4. Run it

**Wokwi (VS Code extension)** — open the `firmware/` folder and start the
simulator. [wokwi.toml](wokwi.toml) already points at the built binary.

Reaching a backend on your own machine needs Wokwi's **Private IoT Gateway**;
that is what makes `host.wokwi.internal` resolve. Without it, deploy the API
somewhere public and put that URL in `API_BASE_URL`.

**Headless (Wokwi CI)** — needs a token from
[wokwi.com/dashboard/ci](https://wokwi.com/dashboard/ci); the free tier includes
50 simulation minutes a month. This is a different credential from the VS Code
extension's licence in `~/.wokwi/user.tok`, which the CLI rejects.

```bash
export WOKWI_CLI_TOKEN=wok_...
cd firmware
wokwi-cli . --scenario test/boot.scenario.yaml --timeout 60000
```

[test/boot.scenario.yaml](test/boot.scenario.yaml) asserts boot, Wi-Fi, the
sequence anchor, sensor conversion, the advisory-only risk label, the local
fallback and outbox buffering. It exits non-zero if any of those regress.

**Physical board** — `pio run -t upload -t monitor`, after setting `WIFI_SSID`
and `WIFI_PASSWORD`.

> Two harmless lines you will see: `nvs_get_blob len fail: outbox NOT_FOUND` on
> the very first boot (the retry queue has not been written yet) and one
> `ledc: LEDC is not initialized` from the Arduino core the first time `tone()`
> touches the buzzer channel.

---

## Who owns the actuators

The backend resolves desired actuator state from zone state and sends only the
deltas. The node pulls them every `COMMAND_POLL_MS`, applies each one, and
reports `COMPLETED` — which is what lets the dashboard distinguish _"we asked
for the buzzer"_ from _"the buzzer is on"_.

| Command             | Effect on this board                       |
| ------------------- | ------------------------------------------ |
| `SET_LED`           | `GREEN` / `YELLOW` / `RED` / `AMBER_PULSE` |
| `ACTIVATE_BUZZER`   | buzzer on                                  |
| `DEACTIVATE_BUZZER` | buzzer off                                 |
| `ACTIVATE_RELAY`    | **cuts** power — `PIN_RELAY` LOW           |
| `DEACTIVATE_RELAY`  | restores power — `PIN_RELAY` HIGH          |

The relay naming is inverted against the pin and easy to get backwards:
`ACTIVATE_RELAY` carries `relayCutoff: true`, meaning _cut the power_. See
`ActuatorState` in `backend/src/modules/actuation/actuation.resolver.ts`.

**When the backend goes quiet** for `BACKEND_AUTHORITY_GRACE_MS`, the node stops
obeying stale commands and its own state machine takes the actuators back. A
node that loses the network keeps alarming locally instead of going dark —
losing contact is not evidence the hazard ended. Keep that grace period above
`ZONE_OFFLINE_TIMEOUT_MS` in `backend/.env` so the backend has already marked
the zone `OFFLINE` before the node stops listening. The serial report prints
which authority is currently driving the pins.

---

## Two details that will bite you

**Sequence numbers must never go backwards.** `ordering.service.ts` rejects any
reading numbered below the zone's latest accepted one, and a wedged zone stays
wedged until something higher arrives. A counter restarting at `1` each boot
would therefore brick the node on its first reboot, so the base is anchored to
the wall clock once NTP lands. Nothing publishes before that happens.

**Unknown is not safe.** A PIR that has timed out reports
`occupancyDetected: null`, never `false`. The schema models an unavailable
sensor as null and the backend treats that as unknown; sending `false` would
be a lie that reads as "nobody is in danger here".

---

## Hardware

| Sensor / output | Pin      | Notes                                             |
| --------------- | -------- | ------------------------------------------------- |
| IR flame        | 34       | active-low; bursts latched for `IR_FLAME_HOLD_MS` |
| MQ-2 gas (A)    | 35       | ADC1, linearised to ppm then normalised to 0..1   |
| MQ-2 gas (D)    | 27       | comparator; biased — see `GAS_DIGITAL_ACTIVE_LOW` |
| Water level     | 32       | potentiometer in the simulation                   |
| PIR motion      | 33       | occupancy                                         |
| LEDs G/Y/R      | 18/19/21 |                                                   |
| Buzzer          | 22       |                                                   |
| Relay           | 23       | HIGH = powered, LOW = cut                         |

ADC1 pins throughout, so analog reads keep working with Wi-Fi active.

The protected load hangs off the relay's **NO** terminal, not NC. Wokwi's relay
connects COM–NO while `IN` is HIGH, which is the state the firmware drives when
the backend has _not_ ordered a cut — so the load is energised exactly when it
should be. It also fails safe: a dead or unpowered node leaves `IN` low, COM
falls back to NC, and the load stays de-energised.

Deeper reference: [../docs/circuit-diagram.md](../docs/circuit-diagram.md).
