#pragma once

#include <Arduino.h>

// Zone identity and the API key live in a gitignored header of their own, so
// that a real credential never lands in a tracked file.
//
// Each PlatformIO environment points ZONE_SECRETS_HEADER at its own zone, which
// is what allows three differently-identified nodes to be built and run at the
// same time. Building without an environment falls back to the single active
// zone_secrets.h. Generate either with `pnpm firmware:config`;
// zone_secrets.example.h is the template.
// MULTI_ZONE_NODE compiles every zone in and selects between them at runtime
// with a button, so one board can demonstrate all three rooms. Wokwi simulates
// a single microcontroller per project, so this is the only way to show more
// than one room in a single diagram.
#ifdef MULTI_ZONE_NODE
#include "zone_registry.h"
#elif defined(ZONE_SECRETS_HEADER)
#include ZONE_SECRETS_HEADER
#else
#include "zone_secrets.h"
#endif

// All installation-specific settings live here. Change the backend URL and the
// zone credentials before deploying to physical hardware.
namespace AppConfig {

// A node prefix, not a zone name: the active zone code is appended when a
// readingId is built. A MULTI_ZONE_NODE board is several rooms over its life, so
// baking one room's name in here would mislabel every reading after a switch.
static constexpr char NODE_ID[] = "esp32";
static constexpr char FIRMWARE_VERSION[] = "2.0.0";

// Wokwi's open access point. Replace these values for a physical ESP32.
static constexpr char WIFI_SSID[] = "Wokwi-GUEST";
static constexpr char WIFI_PASSWORD[] = "";
static constexpr int32_t WIFI_CHANNEL = 6;

// --- Backend -------------------------------------------------------------
// host.wokwi.internal reaches the development machine when Wokwi's Private IoT
// Gateway is enabled. For the public gateway, deploy the API publicly and put
// its public HTTP URL here. Read docs/firmware.md before switching to HTTPS:
// this client does not configure certificate validation.
//
// Port 4000 is the backend, not 3000 — the round-1 example server is gone.
static constexpr char API_BASE_URL[] = "http://host.wokwi.internal:4000/api/v1";

// ESP32 pin map (ADC pins are ADC1 pins, so they remain usable with Wi-Fi).
static constexpr uint8_t PIN_FLAME = 34;
static constexpr uint8_t PIN_GAS = 35;
static constexpr uint8_t PIN_GAS_DIGITAL = 27;
static constexpr uint8_t PIN_WATER = 32;
static constexpr uint8_t PIN_MOTION = 33;
static constexpr uint8_t PIN_LED_GREEN = 18;
static constexpr uint8_t PIN_LED_YELLOW = 19;
static constexpr uint8_t PIN_LED_RED = 21;
static constexpr uint8_t PIN_BUZZER = 22;
static constexpr uint8_t PIN_RELAY = 23;
// Zone-select button (MULTI_ZONE_NODE builds only). Wired to ground and read
// with an internal pull-up, so idle is HIGH and a press is LOW.
static constexpr uint8_t PIN_ZONE_SELECT = 13;
static constexpr uint32_t ZONE_SELECT_DEBOUNCE_MS = 250;

// Calibrate these values for the installed sensors. The MQ-2 conversion is a
// simulation-friendly linear approximation; real MQ-2 hardware needs an Rs/R0
// calibration curve for the target gas.
// Calibrated by measurement, not from the MQ-2 datasheet. The Wokwi gas sensor
// sits at a rock-steady ADC 3628 at its clean-air default, so that is the zero
// point; the datasheet-derived floor of 1200 turned idle air into ~9000 ppm and
// every zone booted straight into WARNING, which Test Case 2(a) — "baseline
// clean air → near-zero contribution" — can never pass.
//
// A reading that wanders instead of holding steady means the AOUT wire is not
// actually landing on the pin: an unconnected ADC input drifts. Re-measure
// these if the board or the sensor part changes.
static constexpr uint16_t GAS_ADC_MIN = 3628;
static constexpr uint16_t GAS_ADC_MAX = 4095;
static constexpr uint16_t GAS_PPM_MIN = 0;
static constexpr uint16_t GAS_PPM_MAX = 10000;
static constexpr uint16_t GAS_HIGH_PPM = 1000;

// Physical MQ-2 breakout boards pull DO LOW when the onboard comparator trips;
// Wokwi's gas sensor drives it HIGH instead. Getting this backwards leaves the
// comparator permanently "alarming", which pins the local fallback risk at 30
// no matter how clean the air is. Set true when flashing a real module.
static constexpr bool GAS_DIGITAL_ACTIVE_LOW = false;
static constexpr uint8_t FLOOD_PERCENT = 60;
// Wokwi's IR receiver emits short active-low pulses. Latching each burst makes
// the simulated IR flame event visible to the 100 ms sensor sampling loop.
static constexpr uint32_t IR_FLAME_HOLD_MS = 3000;

// The wire format normalises gas to 0..1 over this ppm span. The backend
// rejects anything outside 0..1 with 422 rather than clamping it, so the
// conversion saturates here instead.
static constexpr uint16_t GAS_REPORT_FULL_SCALE_PPM = GAS_PPM_MAX;

static constexpr uint32_t SENSOR_SAMPLE_MS = 100;
static constexpr uint32_t SENSOR_TIMEOUT_MS = 1500;
static constexpr uint32_t PUBLISH_INTERVAL_MS = 2000;
static constexpr uint32_t HEARTBEAT_INTERVAL_MS = 5000;
static constexpr uint32_t COMMAND_POLL_MS = 2000;

// Commands accumulate as PENDING while no node is pulling them, so the first
// poll after connecting to an established zone can return a hundred at once.
// Every one is applied (a pull marks them DISPATCHED, so an unapplied command
// is a lost command), but each acknowledgement is a blocking POST — sending
// them all in one loop() iteration would hold the task past the watchdog and
// reset the board. Acknowledgements are therefore capped per poll and the
// remainder are reported on the polls that follow.
static constexpr uint16_t MAX_COMMAND_ACKS_PER_POLL = 8;
static constexpr uint32_t WIFI_RETRY_MS = 10000;
static constexpr uint32_t HTTP_TIMEOUT_MS = 1800;
static constexpr uint32_t BACKEND_MAX_RETRY_MS = 30000;

// How long the node keeps obeying the last backend command before it decides
// the backend is gone and its own state machine takes the actuators back.
// Keep this comfortably above ZONE_OFFLINE_TIMEOUT_MS in backend/.env so the
// backend has already marked the zone OFFLINE by the time the node gives up.
static constexpr uint32_t BACKEND_AUTHORITY_GRACE_MS = 15000;

static constexpr uint8_t WATCHDOG_TIMEOUT_SECONDS = 8;
static constexpr uint8_t ANALOG_SAMPLES = 8;
static constexpr uint8_t OUTBOX_CAPACITY = 48;
static constexpr size_t MAX_JSON_BYTES = 1024;

}  // namespace AppConfig
