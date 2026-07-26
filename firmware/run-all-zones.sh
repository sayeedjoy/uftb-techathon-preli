#!/usr/bin/env bash
#
# Launch every zone node at once, each in its own Wokwi session.
#
#   export WOKWI_CLI_TOKEN=wok_...
#   ./run-all-zones.sh [seconds]
#
# Each zone is a separate binary (its UUID and API key are compiled in) driving
# its own diagram, so this is three independent nodes rather than one node
# switching costume. Serial output is interleaved with a zone prefix and each
# zone's full log is written to logs/<zone>.log.
#
# NOTE ON REACHING THE BACKEND: `host.wokwi.internal` only resolves with Wokwi's
# paid Private IoT Gateway. Without it these nodes run correctly but cannot
# deliver readings, so the dashboard will still show all three zones OFFLINE.
# To light up the dashboard, drive the zones from the server instead:
#     pnpm sim:scenario -- --id 5
#
# BILLING: three sessions consume simulation minutes three times as fast. The
# free CI tier is 50 minutes a month.

set -u
cd "$(dirname "$0")" || exit 1

SECONDS_TO_RUN="${1:-60}"
TIMEOUT_MS=$((SECONDS_TO_RUN * 1000))
ZONES=(iot-lab robotics-lab server-room)

if [ -z "${WOKWI_CLI_TOKEN:-}" ]; then
  echo "WOKWI_CLI_TOKEN is not set. Get one at https://wokwi.com/dashboard/ci"
  exit 1
fi

WOKWI="${WOKWI_CLI:-wokwi-cli}"
command -v "$WOKWI" >/dev/null 2>&1 || {
  echo "wokwi-cli not found. Set WOKWI_CLI to its path."
  exit 1
}

for zone in "${ZONES[@]}"; do
  if [ ! -f ".pio/build/$zone/firmware.elf" ]; then
    echo "Missing .pio/build/$zone/firmware.elf — run: pio run"
    exit 1
  fi
done

mkdir -p logs
pids=()

echo "Starting ${#ZONES[@]} zone nodes for ${SECONDS_TO_RUN}s..."
echo ""

for zone in "${ZONES[@]}"; do
  (
    "$WOKWI" . \
      --elf ".pio/build/$zone/firmware.elf" \
      --diagram-file "zones/$zone/diagram.json" \
      --timeout "$TIMEOUT_MS" \
      --timeout-exit-code 0 \
      --serial-log-file "logs/$zone.log" \
      2>&1 | sed -u "s/^/[$zone] /"
  ) &
  pids+=($!)
  # Stagger slightly so three sessions do not open on the same instant.
  sleep 2
done

for pid in "${pids[@]}"; do wait "$pid"; done

echo ""
echo "All zones finished. Per-zone serial logs:"
for zone in "${ZONES[@]}"; do
  printf '  logs/%-14s %s lines\n' "$zone.log" "$(wc -l < "logs/$zone.log" 2>/dev/null || echo 0)"
done
