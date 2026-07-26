#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include <time.h>

#include <cstddef>
#include <cstring>

#include "app_config.h"

namespace {

/**
 * Zone identity: fixed at compile time, or selected at runtime.
 *
 * A MULTI_ZONE_NODE build carries every zone's credentials and sensor set and
 * switches between them on a button press, so one board can act as any room.
 * Wokwi simulates a single microcontroller per project, so this is the only way
 * to show more than one room from a single diagram.
 *
 * Everything downstream reads these accessors rather than a constant, which is
 * what makes a switch total: URL, API key and reported channels all move
 * together, so the node can never post one room's data under another's key.
 */
#ifdef MULTI_ZONE_NODE
uint8_t activeZoneIndex = 0;
inline const AppConfig::ZoneConfig &Z() {
  return AppConfig::ZONE_REGISTRY[activeZoneIndex];
}
#define ZONE_CODE_OF Z().code
#define ZONE_UUID_OF Z().uuid
#define ZONE_KEY_OF Z().apiKey
#define REPORTS_FIRE Z().reportFire
#define REPORTS_GAS Z().reportGas
#define REPORTS_WATER Z().reportWater
#define REPORTS_OCCUPANCY Z().reportOccupancy
constexpr uint8_t ZONE_SLOTS = AppConfig::ZONE_COUNT;
#else
constexpr uint8_t activeZoneIndex = 0;
#define ZONE_CODE_OF AppConfig::ZONE_CODE
#define ZONE_UUID_OF AppConfig::ZONE_UUID
#define ZONE_KEY_OF AppConfig::ZONE_API_KEY
#define REPORTS_FIRE AppConfig::REPORT_FIRE
#define REPORTS_GAS AppConfig::REPORT_GAS
#define REPORTS_WATER AppConfig::REPORT_WATER
#define REPORTS_OCCUPANCY AppConfig::REPORT_OCCUPANCY
constexpr uint8_t ZONE_SLOTS = 1;
#endif

/**
 * Per-zone accessors, taking an explicit index.
 *
 * A queued reading must be serialised and addressed as the zone that captured
 * it, which is not always the zone now selected. Reading the *active* zone here
 * is how a reading buffered as iot-lab picked up a `waterLevel` after the board
 * was switched to the Server Room, and was then rejected by iot-lab with
 * 422 SENSOR_NOT_CONFIGURED. Anything that touches a stored snapshot uses these.
 */
#ifdef MULTI_ZONE_NODE
inline const char* codeOfZone(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].code;
}
inline const char* uuidOfZone(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].uuid;
}
inline const char* keyOfZone(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].apiKey;
}
inline bool zoneReportsFire(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].reportFire;
}
inline bool zoneReportsGas(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].reportGas;
}
inline bool zoneReportsWater(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].reportWater;
}
inline bool zoneReportsOccupancy(uint8_t i) {
  return AppConfig::ZONE_REGISTRY[i].reportOccupancy;
}
#else
inline const char* codeOfZone(uint8_t) { return AppConfig::ZONE_CODE; }
inline const char* uuidOfZone(uint8_t) { return AppConfig::ZONE_UUID; }
inline const char* keyOfZone(uint8_t) { return AppConfig::ZONE_API_KEY; }
inline bool zoneReportsFire(uint8_t) { return AppConfig::REPORT_FIRE; }
inline bool zoneReportsGas(uint8_t) { return AppConfig::REPORT_GAS; }
inline bool zoneReportsWater(uint8_t) { return AppConfig::REPORT_WATER; }
inline bool zoneReportsOccupancy(uint8_t) {
  return AppConfig::REPORT_OCCUPANCY;
}
#endif

enum class SafetyState : uint8_t {
  Green = 0,
  Yellow = 1,
  Orange = 2,
  Red = 3,
  SensorFault = 4,
};

// Mirrors LED_COLOR in packages/shared/src/domain/index.ts. `Off` has no
// backend equivalent; it is only the power-on state before any command lands.
enum class LedPattern : uint8_t {
  Off = 0,
  Green = 1,
  Yellow = 2,
  Red = 3,
  AmberPulse = 4,
};

const char* ledPatternName(LedPattern pattern) {
  switch (pattern) {
    case LedPattern::Green:
      return "GREEN";
    case LedPattern::Yellow:
      return "YELLOW";
    case LedPattern::Red:
      return "RED";
    case LedPattern::AmberPulse:
      return "AMBER_PULSE";
    case LedPattern::Off:
      return "OFF";
  }
  return "OFF";
}

LedPattern ledPatternFromName(const char* name) {
  if (name == nullptr) {
    return LedPattern::Off;
  }
  if (strcmp(name, "GREEN") == 0) return LedPattern::Green;
  if (strcmp(name, "YELLOW") == 0) return LedPattern::Yellow;
  if (strcmp(name, "RED") == 0) return LedPattern::Red;
  if (strcmp(name, "AMBER_PULSE") == 0) return LedPattern::AmberPulse;
  return LedPattern::Off;
}

enum ReadingFlag : uint8_t {
  FireFlag = 1U << 0,
  GasHighFlag = 1U << 1,
  FloodFlag = 1U << 2,
  MotionFlag = 1U << 3,
  GasDigitalFlag = 1U << 4,
};

struct LiveReadings {
  uint16_t gasRaw = 0;
  uint16_t gasPpm = 0;
  uint16_t waterRaw = 0;
  uint8_t waterPercent = 0;
  bool fire = false;
  bool gasDigitalAlarm = false;
  bool gasHigh = false;
  bool flood = false;
  bool motion = false;
  uint8_t risk = 0;
  SafetyState state = SafetyState::SensorFault;
  bool sensorsHealthy = false;
};

// A compact, trivially-copyable record makes the retry queue safe to persist
// as an NVS blob without storing heap pointers or Arduino String objects.
struct ReadingSnapshot {
  uint32_t bootId;
  uint32_t sequence;
  uint32_t capturedAtMs;
  uint32_t epochSeconds;
  uint16_t gasRaw;
  uint16_t gasPpm;
  uint16_t waterRaw;
  uint8_t waterPercent;
  uint8_t risk;
  uint8_t flags;
  uint8_t state;
  uint8_t sensorsHealthy;
  // Which zone captured this. A buffered reading must be delivered to the zone
  // it came from even if the node has since been switched to another room —
  // posting it under the new zone's key would attribute one room's hazard to
  // another. Uses a former padding byte, so the record size is unchanged.
  uint8_t zoneIndex;
  uint8_t reserved[2];
};

struct PersistedOutbox {
  uint32_t magic;
  uint16_t version;
  uint8_t head;
  uint8_t count;
  uint32_t dropped;
  ReadingSnapshot items[AppConfig::OUTBOX_CAPACITY];
  uint32_t checksum;
};

constexpr uint32_t OUTBOX_MAGIC = 0x53435331;  // "SCS1"
// Bumped when zoneIndex claimed a padding byte: a queue persisted by an older
// build would deliver its backlog to zone 0 regardless of origin.
constexpr uint16_t OUTBOX_VERSION = 2;
constexpr uint32_t VALID_EPOCH_MIN = 1704067200UL;  // 2024-01-01 UTC

const char* stateName(SafetyState state) {
  switch (state) {
    case SafetyState::Green:
      return "NORMAL";
    case SafetyState::Yellow:
      return "WARNING";
    case SafetyState::Orange:
      return "DANGER";
    case SafetyState::Red:
      return "CRITICAL";
    case SafetyState::SensorFault:
      return "SENSOR_FAULT";
  }
  return "UNKNOWN";
}

uint32_t calculateChecksum(const uint8_t* data, size_t length) {
  // FNV-1a detects incomplete/corrupt NVS records without extra dependencies.
  uint32_t hash = 2166136261UL;
  for (size_t i = 0; i < length; ++i) {
    hash ^= data[i];
    hash *= 16777619UL;
  }
  return hash;
}

class PersistentOutbox {
 public:
  void begin() {
    preferences_.begin("safety-node", false);
    resetData();

    if (preferences_.getBytesLength("outbox") != sizeof(data_)) {
      return;
    }

    PersistedOutbox candidate{};
    if (preferences_.getBytes("outbox", &candidate, sizeof(candidate)) !=
        sizeof(candidate)) {
      return;
    }

    const uint32_t expected = calculateChecksum(
        reinterpret_cast<const uint8_t*>(&candidate),
        offsetof(PersistedOutbox, checksum));
    if (candidate.magic != OUTBOX_MAGIC ||
        candidate.version != OUTBOX_VERSION ||
        candidate.head >= AppConfig::OUTBOX_CAPACITY ||
        candidate.count > AppConfig::OUTBOX_CAPACITY ||
        candidate.checksum != expected) {
      Serial.println("[OUTBOX] Invalid persisted queue; starting empty");
      return;
    }

    data_ = candidate;
    Serial.printf("[OUTBOX] Restored %u buffered reading(s)\n", data_.count);
  }

  bool empty() const { return data_.count == 0; }
  uint8_t size() const { return data_.count; }
  uint32_t dropped() const { return data_.dropped; }

  const ReadingSnapshot* front() const {
    return empty() ? nullptr : &data_.items[data_.head];
  }

  void enqueue(const ReadingSnapshot& reading) {
    if (data_.count == AppConfig::OUTBOX_CAPACITY) {
      data_.head = (data_.head + 1U) % AppConfig::OUTBOX_CAPACITY;
      --data_.count;
      ++data_.dropped;
      Serial.println("[OUTBOX] Full: oldest reading was discarded");
    }

    const uint8_t tail =
        (data_.head + data_.count) % AppConfig::OUTBOX_CAPACITY;
    data_.items[tail] = reading;
    ++data_.count;
    save();
  }

  void pop() {
    if (empty()) {
      return;
    }
    data_.head = (data_.head + 1U) % AppConfig::OUTBOX_CAPACITY;
    --data_.count;
    save();
  }

 private:
  void resetData() {
    memset(&data_, 0, sizeof(data_));
    data_.magic = OUTBOX_MAGIC;
    data_.version = OUTBOX_VERSION;
  }

  void save() {
    data_.checksum = calculateChecksum(
        reinterpret_cast<const uint8_t*>(&data_),
        offsetof(PersistedOutbox, checksum));
    if (preferences_.putBytes("outbox", &data_, sizeof(data_)) !=
        sizeof(data_)) {
      Serial.println("[OUTBOX] Warning: could not persist retry queue");
    }
  }

  Preferences preferences_;
  PersistedOutbox data_{};
};

// What the backend last told this node to do. The backend is the authority
// whenever it is reachable; these fields hold its most recent instruction.
struct CommandedState {
  LedPattern led = LedPattern::Off;
  bool buzzer = false;
  // Mirrors the backend's `relayCutoff`. NOTE the inversion against the pin:
  // cutoff true means the relay coil is DE-energised (PIN_RELAY LOW).
  bool relayCutoff = true;
  bool received = false;
};

class AlarmManager {
 public:
  void begin() {
    pinMode(AppConfig::PIN_LED_GREEN, OUTPUT);
    pinMode(AppConfig::PIN_LED_YELLOW, OUTPUT);
    pinMode(AppConfig::PIN_LED_RED, OUTPUT);
    pinMode(AppConfig::PIN_BUZZER, OUTPUT);
    pinMode(AppConfig::PIN_RELAY, OUTPUT);

    // Failsafe first: power remains cut until a valid sensor sample is read.
    digitalWrite(AppConfig::PIN_RELAY, LOW);
    setLeds(false, false, false);
    setBuzzer(false, 0);
  }

  /**
   * Drive the actuators.
   *
   * `commanded` wins whenever the backend is reachable and has spoken: it owns
   * hazard response, and a node that quietly disagreed with it would be a
   * second authority. `fallback` — the on-device state machine — takes over
   * only once the backend has gone quiet for BACKEND_AUTHORITY_GRACE_MS, so a
   * node that loses the network still alarms locally rather than going dark.
   */
  void update(const CommandedState& commanded, bool backendAuthoritative,
              SafetyState fallback, uint32_t now) {
    if (backendAuthoritative && commanded.received) {
      applyCommanded(commanded, now);
    } else {
      applyLocal(fallback, now);
    }
  }

 private:
  void applyCommanded(const CommandedState& commanded, uint32_t now) {
    const bool amberPulse = (now % 900U) < 450U;

    switch (commanded.led) {
      case LedPattern::Green:
        setLeds(true, false, false);
        break;
      case LedPattern::Yellow:
        setLeds(false, true, false);
        break;
      case LedPattern::Red:
        setLeds(false, false, true);
        break;
      case LedPattern::AmberPulse:
        // Amber is green+red on this board; pulsing keeps it distinct from a
        // steady WARNING yellow, which is the whole point of the amber state.
        setLeds(amberPulse, amberPulse, false);
        break;
      case LedPattern::Off:
        setLeds(false, false, false);
        break;
    }

    setBuzzer(commanded.buzzer, 2800);
    setRelay(!commanded.relayCutoff);
  }

  void applyLocal(SafetyState state, uint32_t now) {
    const bool slowPulse = (now % 1000U) < 120U;
    const bool mediumFlash = (now % 500U) < 250U;
    const bool fastPulse = (now % 300U) < 150U;

    switch (state) {
      case SafetyState::Green:
        setLeds(true, false, false);
        setBuzzer(false, 0);
        setRelay(true);
        break;

      case SafetyState::Yellow:
        setLeds(false, true, false);
        setBuzzer(slowPulse, 1800);
        setRelay(true);
        break;

      case SafetyState::Orange:
        setLeds(false, mediumFlash, !mediumFlash);
        setBuzzer(fastPulse, 2300);
        setRelay(false);
        break;

      case SafetyState::Red:
        setLeds(false, false, mediumFlash);
        setBuzzer(true, 2800);
        setRelay(false);
        break;

      case SafetyState::SensorFault:
        setLeds(false, false, fastPulse);
        setBuzzer(fastPulse, 1200);
        setRelay(false);
        break;
    }
  }

  void setLeds(bool green, bool yellow, bool red) {
    digitalWrite(AppConfig::PIN_LED_GREEN, green ? HIGH : LOW);
    digitalWrite(AppConfig::PIN_LED_YELLOW, yellow ? HIGH : LOW);
    digitalWrite(AppConfig::PIN_LED_RED, red ? HIGH : LOW);
  }

  void setRelay(bool on) {
    if (on == relayOn_) {
      return;
    }
    relayOn_ = on;
    digitalWrite(AppConfig::PIN_RELAY, on ? HIGH : LOW);
  }

  void setBuzzer(bool on, uint16_t frequency) {
    if (on == buzzerOn_ && (!on || frequency == buzzerFrequency_)) {
      return;
    }
    buzzerOn_ = on;
    buzzerFrequency_ = frequency;
    if (on) {
      tone(AppConfig::PIN_BUZZER, frequency);
    } else {
      noTone(AppConfig::PIN_BUZZER);
    }
  }

  bool relayOn_ = false;
  bool buzzerOn_ = false;
  uint16_t buzzerFrequency_ = 0;
};

PersistentOutbox outbox;
AlarmManager alarmManager;
LiveReadings liveReadings;
CommandedState commandedState;

uint32_t bootId = 0;
/**
 * Sequence numbers are unique per zone for all time and must never go
 * backwards: ordering.service.ts rejects anything below the latest accepted
 * reading, and a rejected zone stays wedged until a higher number arrives. A
 * counter restarting at 1 on every boot would therefore brick the node after
 * its first reboot, so the base is seeded from the wall clock once NTP lands
 * — the same trick backend/scripts/run-load.ts uses for the same reason.
 */
// One counter per zone: sequence numbers are unique *per zone*, so a shared
// counter would make every switch look like a jump to the zone it moved to.
uint32_t nextSequence[ZONE_SLOTS] = {1};
bool sequenceSeeded = false;
uint32_t lastSensorSampleMs = 0;
uint32_t lastPublishMs = 0;
uint32_t lastHeartbeatMs = 0;
uint32_t lastCommandPollMs = 0;
uint32_t nextWifiAttemptMs = 0;
uint32_t nextBackendAttemptMs = 0;
uint32_t lastBackendSuccessMs = 0;
uint8_t backendFailureCount = 0;
bool backendAttempted = false;
bool wifiWasConnected = false;
bool timeConfigured = false;
volatile uint32_t lastFlameIrPulseUs = 0;

void IRAM_ATTR onFlameIrActivity() {
  lastFlameIrPulseUs = micros();
}

bool intervalElapsed(uint32_t now, uint32_t since, uint32_t interval) {
  return static_cast<uint32_t>(now - since) >= interval;
}

bool deadlineReached(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}

uint16_t readAveragedAdc(uint8_t pin) {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < AppConfig::ANALOG_SAMPLES; ++i) {
    sum += analogRead(pin);
  }
  return static_cast<uint16_t>(sum / AppConfig::ANALOG_SAMPLES);
}

uint16_t gasRawToPpm(uint16_t raw) {
  const long bounded = constrain(static_cast<long>(raw),
                                 static_cast<long>(AppConfig::GAS_ADC_MIN),
                                 static_cast<long>(AppConfig::GAS_ADC_MAX));
  return static_cast<uint16_t>(map(
      bounded, AppConfig::GAS_ADC_MIN, AppConfig::GAS_ADC_MAX,
      AppConfig::GAS_PPM_MIN, AppConfig::GAS_PPM_MAX));
}

uint8_t waterRawToPercent(uint16_t raw) {
  return static_cast<uint8_t>(map(constrain(raw, static_cast<uint16_t>(0),
                                            static_cast<uint16_t>(4095)),
                                  0, 4095, 0, 100));
}

uint8_t calculateRisk(bool fire, bool gasHigh, bool flood, bool motion) {
  uint16_t score = 0;
  score += fire ? 50 : 0;
  score += gasHigh ? 30 : 0;
  score += flood ? 20 : 0;
  score += motion ? 10 : 0;
  return static_cast<uint8_t>(min<uint16_t>(score, 100));
}

SafetyState stateForRisk(uint8_t risk) {
  if (risk < 20) {
    return SafetyState::Green;
  }
  if (risk < 50) {
    return SafetyState::Yellow;
  }
  if (risk < 75) {
    return SafetyState::Orange;
  }
  return SafetyState::Red;
}

void sampleSensors(uint32_t now) {
  LiveReadings next{};
  const uint32_t lastPulseUs = lastFlameIrPulseUs;
  const bool recentIrBurst =
      lastPulseUs != 0 &&
      static_cast<uint32_t>(micros() - lastPulseUs) <
          AppConfig::IR_FLAME_HOLD_MS * 1000UL;
  // The Wokwi IR receiver and common digital flame modules are active-low.
  // A sustained LOW supports real modules; the latch makes remote bursts easy
  // to observe in the simulator.
  // Only channels this zone actually has are sampled. An unpopulated ADC pin
  // floats, and a floating pin reads as a hazard: on the Server Room board —
  // which has no MQ-2 — D35 drifted high enough to raise gasHigh and push the
  // local fallback risk to 30 out of thin air. A channel the zone does not
  // report contributes nothing rather than inventing an alarm.
  next.fire = REPORTS_FIRE &&
              (digitalRead(AppConfig::PIN_FLAME) == LOW || recentIrBurst);
  next.motion =
      REPORTS_OCCUPANCY && digitalRead(AppConfig::PIN_MOTION) == HIGH;

  if (REPORTS_GAS) {
    next.gasRaw = readAveragedAdc(AppConfig::PIN_GAS);
    next.gasPpm = gasRawToPpm(next.gasRaw);
    // Either the calibrated analog threshold or the module's own comparator
    // raises the hazard. Polarity differs between real breakout boards and the
    // simulated part — see GAS_DIGITAL_ACTIVE_LOW.
    next.gasDigitalAlarm =
        digitalRead(AppConfig::PIN_GAS_DIGITAL) ==
        (AppConfig::GAS_DIGITAL_ACTIVE_LOW ? LOW : HIGH);
    next.gasHigh =
        next.gasDigitalAlarm || next.gasPpm >= AppConfig::GAS_HIGH_PPM;
  }

  if (REPORTS_WATER) {
    next.waterRaw = readAveragedAdc(AppConfig::PIN_WATER);
    next.waterPercent = waterRawToPercent(next.waterRaw);
    next.flood = next.waterPercent >= AppConfig::FLOOD_PERCENT;
  }
  next.risk =
      calculateRisk(next.fire, next.gasHigh, next.flood, next.motion);
  next.state = stateForRisk(next.risk);
  next.sensorsHealthy = true;

  liveReadings = next;
  lastSensorSampleMs = now;
}

void enforceSensorTimeout(uint32_t now) {
  if (lastSensorSampleMs == 0 ||
      intervalElapsed(now, lastSensorSampleMs, AppConfig::SENSOR_TIMEOUT_MS)) {
    liveReadings.sensorsHealthy = false;
    liveReadings.state = SafetyState::SensorFault;
  }
}

uint32_t currentEpochSeconds() {
  const time_t now = time(nullptr);
  return now >= static_cast<time_t>(VALID_EPOCH_MIN)
             ? static_cast<uint32_t>(now)
             : 0;
}

/**
 * Anchor the sequence counter to the wall clock the first time NTP delivers a
 * plausible time. Epoch seconds fit the backend's 32-bit signed column until
 * 2038 and are monotonic across reboots, which is the property that matters.
 */
void seedSequenceFromClock() {
  if (sequenceSeeded) {
    return;
  }
  const uint32_t epoch = currentEpochSeconds();
  if (epoch < VALID_EPOCH_MIN) {
    return;
  }
  for (uint8_t i = 0; i < ZONE_SLOTS; ++i) {
    nextSequence[i] = epoch;
  }
  sequenceSeeded = true;
  Serial.printf("[SEQ] Sequence base anchored at %lu\n",
                static_cast<unsigned long>(epoch));
}

ReadingSnapshot createSnapshot(uint32_t now) {
  ReadingSnapshot snapshot{};
  snapshot.bootId = bootId;
  snapshot.sequence = nextSequence[activeZoneIndex]++;
  snapshot.zoneIndex = activeZoneIndex;
  snapshot.capturedAtMs = now;
  snapshot.epochSeconds = currentEpochSeconds();
  snapshot.gasRaw = liveReadings.gasRaw;
  snapshot.gasPpm = liveReadings.gasPpm;
  snapshot.waterRaw = liveReadings.waterRaw;
  snapshot.waterPercent = liveReadings.waterPercent;
  snapshot.risk = liveReadings.risk;
  snapshot.state = static_cast<uint8_t>(liveReadings.state);
  snapshot.sensorsHealthy = liveReadings.sensorsHealthy ? 1U : 0U;
  snapshot.flags = (liveReadings.fire ? FireFlag : 0U) |
                   (liveReadings.gasHigh ? GasHighFlag : 0U) |
                   (liveReadings.flood ? FloodFlag : 0U) |
                   (liveReadings.motion ? MotionFlag : 0U) |
                   (liveReadings.gasDigitalAlarm ? GasDigitalFlag : 0U);
  return snapshot;
}

bool formatTimestamp(uint32_t epochSeconds, char* buffer, size_t size) {
  if (epochSeconds < VALID_EPOCH_MIN || buffer == nullptr || size < 21) {
    return false;
  }
  const time_t value = static_cast<time_t>(epochSeconds);
  struct tm utc {};
  gmtime_r(&value, &utc);
  return strftime(buffer, size, "%Y-%m-%dT%H:%M:%SZ", &utc) == 20;
}

// The wire contract carries normalised 0..1 levels, not ppm or percent. The
// backend rejects anything outside that range with 422 instead of clamping,
// so saturation happens here where the calibration constants live.
float gasPpmToUnitScale(uint16_t ppm) {
  if (AppConfig::GAS_REPORT_FULL_SCALE_PPM == 0) {
    return 0.0f;
  }
  const float scaled = static_cast<float>(ppm) /
                       static_cast<float>(AppConfig::GAS_REPORT_FULL_SCALE_PPM);
  return scaled < 0.0f ? 0.0f : (scaled > 1.0f ? 1.0f : scaled);
}

float waterPercentToUnitScale(uint8_t percent) {
  const float scaled = static_cast<float>(percent) / 100.0f;
  return scaled < 0.0f ? 0.0f : (scaled > 1.0f ? 1.0f : scaled);
}

/**
 * Recover the wall-clock capture time of a queued reading.
 *
 * A reading captured before NTP synced has epochSeconds == 0. Rather than drop
 * it or stamp it with the send time — which would misreport when the hazard
 * actually happened — subtract the elapsed millis() since capture from the now
 * known epoch. Readings taken before any sync still get an honest timestamp
 * once the clock lands.
 */
uint32_t resolveCaptureEpoch(const ReadingSnapshot& reading, uint32_t nowMs) {
  if (reading.epochSeconds >= VALID_EPOCH_MIN) {
    return reading.epochSeconds;
  }

  const time_t wallClock = time(nullptr);
  if (wallClock < static_cast<time_t>(VALID_EPOCH_MIN)) {
    return 0;
  }

  const uint32_t ageMs = nowMs - reading.capturedAtMs;
  const uint32_t ageSeconds = ageMs / 1000UL;
  const uint32_t nowEpoch = static_cast<uint32_t>(wallClock);
  return ageSeconds > nowEpoch ? 0 : nowEpoch - ageSeconds;
}

bool validateSnapshot(const ReadingSnapshot& reading) {
  const auto state = static_cast<SafetyState>(reading.state);
  return reading.risk <= 100 && reading.waterPercent <= 100 &&
         reading.gasRaw <= 4095 && reading.waterRaw <= 4095 &&
         state >= SafetyState::Green && state <= SafetyState::SensorFault;
}

/**
 * Build the one payload the backend accepts.
 *
 * Everything this node computes — risk, state, gas_high, flood, relay_on — is
 * deliberately absent. `sensorValuesSchema` is `.strict()`, so a stray computed
 * field is not ignored, it is a 400. That is the platform's first invariant:
 * a sensor node is never trusted with a computed value. The local risk score
 * still exists (see calculateRisk) but it drives only this node's own fallback
 * alarms and its serial report; it never crosses the wire.
 *
 * Shape mirrors sensorReadingSchema in
 * packages/shared/src/schemas/sensor-reading.schema.ts.
 */
bool serializeReading(const ReadingSnapshot& reading, uint32_t nowMs,
                      String& output) {
  if (!validateSnapshot(reading)) {
    Serial.println("[JSON] Refused invalid reading");
    return false;
  }

  char timestamp[21];
  if (!formatTimestamp(resolveCaptureEpoch(reading, nowMs), timestamp,
                       sizeof(timestamp))) {
    // No trustworthy clock yet. `capturedAt` is required and the backend
    // rejects a future skew beyond MAX_FUTURE_TIMESTAMP_SKEW_MS, so guessing
    // is worse than waiting: the reading stays queued until NTP lands.
    return false;
  }

  JsonDocument document;
  // readingId is UNIQUE across the whole table, not per zone, so it has to name
  // the zone: with a fixed node id and every zone's counter seeded from the same
  // epoch, the first reading after a switch collided with one another room had
  // already stored and came back 409 DUPLICATE_READING.
  char readingId[120];
  snprintf(readingId, sizeof(readingId), "%s-%s-%08lX-%010lu",
           AppConfig::NODE_ID, codeOfZone(reading.zoneIndex),
           static_cast<unsigned long>(reading.bootId),
           static_cast<unsigned long>(reading.sequence));

  document["readingId"] = readingId;
  document["sequenceNumber"] = reading.sequence;
  document["capturedAt"] = timestamp;

  JsonObject sensors = document["sensors"].to<JsonObject>();
  if (zoneReportsFire(reading.zoneIndex)) {
    sensors["fireDetected"] = (reading.flags & FireFlag) != 0;
  }
  if (zoneReportsGas(reading.zoneIndex)) {
    sensors["gasLevel"] = gasPpmToUnitScale(reading.gasPpm);
  }
  if (zoneReportsWater(reading.zoneIndex)) {
    sensors["waterLevel"] = waterPercentToUnitScale(reading.waterPercent);
  }
  if (zoneReportsOccupancy(reading.zoneIndex)) {
    // A PIR that has timed out reports unknown, not "nobody here". The schema
    // models unavailable occupancy as null and the backend treats it as
    // unknown rather than safe — sending false would be a lie.
    if (reading.sensorsHealthy) {
      sensors["occupancyDetected"] = (reading.flags & MotionFlag) != 0;
    } else {
      sensors["occupancyDetected"] = nullptr;
    }
  }

  if (!reading.sensorsHealthy) {
    JsonObject health = document["sensorHealth"].to<JsonObject>();
    JsonObject node = health["node"].to<JsonObject>();
    node["available"] = false;
    node["message"] = "Sensor sampling timed out";
  }

  if (document.overflowed()) {
    Serial.println("[JSON] Document overflow");
    return false;
  }

  output = "";
  output.reserve(AppConfig::MAX_JSON_BYTES);
  const size_t written = serializeJson(document, output);
  return written > 0 && written < AppConfig::MAX_JSON_BYTES;
}

/**
 * The backend answers in the ApiResponse envelope from @scsrg/shared:
 * `{"success":true,"data":{...}}`. A 2xx with `success:false` should not
 * happen, but treating it as delivered would silently drop the reading.
 */
bool validBackendAcknowledgement(const String& response) {
  if (response.isEmpty()) {
    return false;
  }
  JsonDocument document;
  const DeserializationError error = deserializeJson(document, response);
  if (error) {
    Serial.printf("[HTTP] Invalid response JSON: %s\n", error.c_str());
    return false;
  }
  return document["success"].is<bool>() && document["success"].as<bool>();
}

// Every ingestion route is scoped to the zone UUID and authenticated by the
// zone's own key. A dashboard JWT cannot satisfy requireZoneApiKey, and this
// key never leaves the node.
// A buffered reading must go to the zone that captured it, which is not always
// the zone currently selected. Both helpers therefore take an explicit index
// rather than reading the active one, so a queued reading cannot be posted
// under whichever room the button happens to be on now.
String zoneUrlFor(uint8_t zoneIndex, const char* suffix) {
  String url(AppConfig::API_BASE_URL);
  url += "/ingestion/zones/";
  url += uuidOfZone(zoneIndex);
  url += suffix;
  return url;
}

String zoneUrl(const char* suffix) {
  return zoneUrlFor(activeZoneIndex, suffix);
}

void addStandardHeaders(HTTPClient& http, uint8_t zoneIndex) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "SCS-ESP32/2.0");
  http.addHeader("x-zone-api-key", keyOfZone(zoneIndex));
}

/**
 * Log a rejection in full.
 *
 * A 400 or 422 here is the backend refusing bad or over-reaching data, and the
 * body says exactly which field and why. Swallowing it would turn the most
 * useful diagnostic this node ever receives into a silent retry loop.
 */
void reportRejection(int statusCode, const String& response) {
  Serial.printf("[HTTP] Rejected with status %d\n", statusCode);
  if (response.isEmpty()) {
    return;
  }

  JsonDocument document;
  if (deserializeJson(document, response)) {
    Serial.printf("[HTTP] Body: %s\n", response.c_str());
    return;
  }

  const char* code = document["error"]["code"] | "";
  const char* message = document["error"]["message"] | "";
  if (strlen(code) > 0 || strlen(message) > 0) {
    Serial.printf("[HTTP] %s: %s\n", code, message);
  } else {
    Serial.printf("[HTTP] Body: %s\n", response.c_str());
  }
}

bool postJson(const String& url, const String& payload, bool requireAck,
              uint8_t zoneIndex) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(AppConfig::HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) {
    Serial.println("[HTTP] Could not initialize request");
    return false;
  }

  addStandardHeaders(http, zoneIndex);

  const int statusCode = http.POST(payload);
  const String response = statusCode > 0 ? http.getString() : String();
  http.end();

  if (statusCode < 200 || statusCode >= 300) {
    if (statusCode > 0) {
      reportRejection(statusCode, response);
    } else {
      Serial.printf("[HTTP] Transport error: %s\n",
                    HTTPClient::errorToString(statusCode).c_str());
    }
    return false;
  }
  return !requireAck || validBackendAcknowledgement(response);
}

bool getJson(const String& url, String& response, uint8_t zoneIndex) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(AppConfig::HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) {
    return false;
  }

  addStandardHeaders(http, zoneIndex);

  const int statusCode = http.GET();
  response = statusCode > 0 ? http.getString() : String();
  http.end();

  if (statusCode < 200 || statusCode >= 300) {
    if (statusCode > 0) {
      reportRejection(statusCode, response);
    }
    return false;
  }
  return true;
}

void registerBackendFailure(uint32_t now) {
  backendAttempted = true;
  backendFailureCount = min<uint8_t>(backendFailureCount + 1U, 6U);
  uint32_t backoff = 1000UL << (backendFailureCount - 1U);
  backoff = min(backoff, AppConfig::BACKEND_MAX_RETRY_MS);
  nextBackendAttemptMs = now + backoff + static_cast<uint32_t>(random(0, 251));
}

void registerBackendSuccess(uint32_t now) {
  backendAttempted = true;
  backendFailureCount = 0;
  lastBackendSuccessMs = now;
  nextBackendAttemptMs = now + 100U;
}

bool sendReading(const ReadingSnapshot& reading, uint32_t now) {
  String payload;
  if (!serializeReading(reading, now, payload)) {
    return false;
  }

  if (postJson(zoneUrlFor(reading.zoneIndex, "/readings"), payload, true,
               reading.zoneIndex)) {
    registerBackendSuccess(now);
    return true;
  }
  registerBackendFailure(now);
  return false;
}

/**
 * Tell the backend a dispatched command was carried out.
 *
 * Reporting COMPLETED is what lets the dashboard distinguish "we asked for the
 * buzzer" from "the buzzer is on", so a node that applied a command and stayed
 * silent would be indistinguishable from one that ignored it.
 */
void completeCommand(const char* commandId, bool succeeded) {
  if (commandId == nullptr || strlen(commandId) == 0) {
    return;
  }

  JsonDocument document;
  document["status"] = succeeded ? "COMPLETED" : "FAILED";
  if (!succeeded) {
    document["message"] = "Actuator refused the command";
  }

  String payload;
  serializeJson(document, payload);

  String suffix("/commands/");
  suffix += commandId;
  suffix += "/complete";
  postJson(zoneUrl(suffix.c_str()), payload, false, activeZoneIndex);
}

/**
 * Pull pending actuation commands and apply them.
 *
 * The backend resolves desired actuator state from zone state and sends only
 * the deltas, so this is normally an empty list. Each command mutates the
 * commanded state that AlarmManager applies on the next loop tick.
 */
void pollCommands(uint32_t now) {
  String response;
  if (!getJson(zoneUrl("/commands"), response, activeZoneIndex)) {
    registerBackendFailure(now);
    return;
  }
  registerBackendSuccess(now);

  JsonDocument document;
  if (deserializeJson(document, response)) {
    Serial.println("[CMD] Could not parse command list");
    return;
  }

  JsonArrayConst commands = document["data"]["commands"].as<JsonArrayConst>();
  if (commands.isNull()) {
    return;
  }

  // Applying and acknowledging are deliberately separated.
  //
  // A pull marks every command it returns as DISPATCHED, so a command this
  // node declines to apply is simply lost — all of them must be applied, and
  // applying is pure in-memory work that cannot block. Acknowledging is a
  // blocking POST each, and the first connection to a zone with a backlog can
  // return a hundred of them. Sending that many acknowledgements inside one
  // loop() iteration would hold the task past WATCHDOG_TIMEOUT_SECONDS and
  // reset the board, so the acknowledgements are capped per poll and the
  // watchdog is fed between them.
  uint16_t applied = 0;
  uint16_t unknown = 0;

  for (JsonObjectConst command : commands) {
    const char* type = command["type"] | "";

    if (strcmp(type, "SET_LED") == 0) {
      commandedState.led = ledPatternFromName(command["payload"]["color"] | "");
    } else if (strcmp(type, "ACTIVATE_BUZZER") == 0) {
      commandedState.buzzer = true;
    } else if (strcmp(type, "DEACTIVATE_BUZZER") == 0) {
      commandedState.buzzer = false;
    } else if (strcmp(type, "ACTIVATE_RELAY") == 0) {
      // ACTIVATE_RELAY means "cut the power" — see ActuatorState.relayCutoff
      // in backend/src/modules/actuation/actuation.resolver.ts.
      commandedState.relayCutoff = true;
    } else if (strcmp(type, "DEACTIVATE_RELAY") == 0) {
      commandedState.relayCutoff = false;
    } else {
      Serial.printf("[CMD] Unknown command type '%s'\n", type);
      ++unknown;
      continue;
    }

    commandedState.received = true;
    ++applied;
  }

  if (applied > 0) {
    Serial.printf("[CMD] Applied %u command(s): LED=%s buzzer=%s relay=%s\n",
                  applied, ledPatternName(commandedState.led),
                  commandedState.buzzer ? "ON" : "OFF",
                  commandedState.relayCutoff ? "CUT" : "CLOSED");
  }

  uint16_t acknowledged = 0;
  for (JsonObjectConst command : commands) {
    if (acknowledged >= AppConfig::MAX_COMMAND_ACKS_PER_POLL) {
      break;
    }
    const char* type = command["type"] | "";
    const bool known = strcmp(type, "SET_LED") == 0 ||
                       strcmp(type, "ACTIVATE_BUZZER") == 0 ||
                       strcmp(type, "DEACTIVATE_BUZZER") == 0 ||
                       strcmp(type, "ACTIVATE_RELAY") == 0 ||
                       strcmp(type, "DEACTIVATE_RELAY") == 0;

    esp_task_wdt_reset();
    completeCommand(command["id"] | "", known);
    ++acknowledged;
  }

  const uint16_t total = static_cast<uint16_t>(commands.size());
  if (acknowledged < total) {
    // Say so rather than let a truncated batch look like a completed one.
    Serial.printf(
        "[CMD] Acknowledged %u of %u; %u already applied but not yet reported\n",
        acknowledged, total, static_cast<uint16_t>(total - acknowledged));
  }
  if (unknown > 0) {
    Serial.printf("[CMD] %u command(s) of an unrecognised type\n", unknown);
  }
}

/**
 * Has the backend spoken recently enough to still own the actuators?
 *
 * Once this goes false the node stops obeying stale commands and falls back to
 * its own state machine. Losing the backend must never look like "all clear".
 */
bool backendIsAuthoritative(uint32_t now) {
  return lastBackendSuccessMs != 0 &&
         !intervalElapsed(now, lastBackendSuccessMs,
                          AppConfig::BACKEND_AUTHORITY_GRACE_MS);
}

const char* backendStateText(uint32_t now) {
  if (lastBackendSuccessMs != 0 &&
      !intervalElapsed(now, lastBackendSuccessMs, 10000U)) {
    return "OK";
  }
  return backendAttempted ? "OFFLINE" : "WAITING";
}

void printSerialReport(const ReadingSnapshot& reading, uint32_t now) {
  const auto state = static_cast<SafetyState>(reading.state);
  const bool commanded = backendIsAuthoritative(now) && commandedState.received;

  Serial.printf("\n======== %s ========\n\n", ZONE_CODE_OF);
  Serial.printf("Fire           : %s\n",
                (reading.flags & FireFlag) ? "YES" : "NO");
  Serial.printf("Gas            : %u ppm (ADC %u, DO %s)%s\n",
                reading.gasPpm, reading.gasRaw,
                (reading.flags & GasDigitalFlag) ? "ALARM" : "OK",
                (reading.flags & GasHighFlag) ? " - HIGH" : "");
  Serial.printf("Water          : %s (%u%%, ADC %u)\n",
                (reading.flags & FloodFlag) ? "FLOOD" : "LOW",
                reading.waterPercent, reading.waterRaw);
  Serial.printf("Motion         : %s\n",
                (reading.flags & MotionFlag) ? "YES" : "NO");
  // Mirror the payload exactly, including which channels are omitted. Printing
  // a field the node does not actually send would send someone hunting for a
  // backend bug that is really just REPORT_* switched off here.
  Serial.print("Sent as        : ");
  if (zoneReportsFire(reading.zoneIndex)) {
    Serial.printf("fire=%s ", (reading.flags & FireFlag) ? "true" : "false");
  }
  if (zoneReportsGas(reading.zoneIndex)) {
    Serial.printf("gas=%.3f ", gasPpmToUnitScale(reading.gasPpm));
  }
  if (zoneReportsWater(reading.zoneIndex)) {
    Serial.printf("water=%.3f ", waterPercentToUnitScale(reading.waterPercent));
  }
  if (zoneReportsOccupancy(reading.zoneIndex)) {
    Serial.printf("occupancy=%s ",
                  reading.sensorsHealthy
                      ? ((reading.flags & MotionFlag) ? "true" : "false")
                      : "null");
  }
  Serial.printf("(omitted: %s%s%s%s)\n", zoneReportsFire(reading.zoneIndex) ? "" : "fire ",
                zoneReportsGas(reading.zoneIndex) ? "" : "gas ",
                zoneReportsWater(reading.zoneIndex) ? "" : "water ",
                zoneReportsOccupancy(reading.zoneIndex) ? "" : "occupancy ");
  // Local risk is advisory. The backend scores the zone and this number never
  // leaves the device — it only decides what the alarms do if the link drops.
  Serial.printf("Local risk     : %u / 100 (%s, advisory only)\n", reading.risk,
                stateName(state));
  Serial.printf("Actuators      : %s\n",
                commanded ? "backend-commanded" : "LOCAL FALLBACK");
  if (commanded) {
    Serial.printf("  LED=%s buzzer=%s relay=%s\n",
                  ledPatternName(commandedState.led),
                  commandedState.buzzer ? "ON" : "OFF",
                  commandedState.relayCutoff ? "CUT" : "CLOSED");
  }
  Serial.printf("Sensor Health  : %s\n",
                reading.sensorsHealthy ? "OK" : "TIMEOUT");
  Serial.printf("WiFi           : %s\n",
                WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
  Serial.printf("Backend        : %s\n", backendStateText(now));
  Serial.printf("Buffered       : %u (dropped: %lu)\n", outbox.size(),
                static_cast<unsigned long>(outbox.dropped()));
  Serial.println("\n========================");
}

void manageWifi(uint32_t now) {
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected) {
    if (!wifiWasConnected) {
      wifiWasConnected = true;
      Serial.printf("[WiFi] Connected, IP=%s, RSSI=%d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      if (!timeConfigured) {
        configTime(0, 0, "pool.ntp.org", "time.nist.gov");
        timeConfigured = true;
      }
      nextBackendAttemptMs = now;
    }
    return;
  }

  if (wifiWasConnected) {
    wifiWasConnected = false;
    Serial.println("[WiFi] Connection lost");
  }

  if (!deadlineReached(now, nextWifiAttemptMs)) {
    return;
  }

  Serial.printf("[WiFi] Connecting to %s...\n", AppConfig::WIFI_SSID);
  WiFi.disconnect(false, false);
  WiFi.begin(AppConfig::WIFI_SSID, AppConfig::WIFI_PASSWORD,
             AppConfig::WIFI_CHANNEL);
  nextWifiAttemptMs = now + AppConfig::WIFI_RETRY_MS;
}

#ifdef MULTI_ZONE_NODE
uint32_t lastZoneSwitchMs = 0;
int lastZoneButtonLevel = HIGH;

/**
 * Cycle to the next room on a button press.
 *
 * The switch is total — credentials, URL and reported channels all move at
 * once. Anything still queued keeps the zone index it was captured with, so a
 * backlog from the previous room is still delivered to that room.
 *
 * Backend authority is dropped deliberately: commands pulled for the old zone
 * say nothing about this one, and obeying them would leave the board showing
 * one room's alarm state while reporting another's readings.
 */
void pollZoneSelectButton(uint32_t now) {
  const int level = digitalRead(AppConfig::PIN_ZONE_SELECT);
  const bool pressed = lastZoneButtonLevel == HIGH && level == LOW;
  lastZoneButtonLevel = level;

  if (!pressed ||
      !intervalElapsed(now, lastZoneSwitchMs,
                       AppConfig::ZONE_SELECT_DEBOUNCE_MS)) {
    return;
  }
  lastZoneSwitchMs = now;

  activeZoneIndex = (activeZoneIndex + 1U) % AppConfig::ZONE_COUNT;

  commandedState = CommandedState{};
  lastBackendSuccessMs = 0;
  backendFailureCount = 0;
  backendAttempted = false;
  nextBackendAttemptMs = now;

  Serial.printf(
      "\n***** ZONE -> %s (%u/%u) — reporting%s%s%s%s *****\n\n", ZONE_CODE_OF,
      static_cast<unsigned>(activeZoneIndex + 1),
      static_cast<unsigned>(AppConfig::ZONE_COUNT),
      REPORTS_FIRE ? " fire" : "", REPORTS_GAS ? " gas" : "",
      REPORTS_WATER ? " water" : "", REPORTS_OCCUPANCY ? " occupancy" : "");
}
#endif

void publishReading(uint32_t now) {
  // Nothing may be numbered before the clock anchors the counter. Publishing
  // from a boot-local 1, 2, 3… would sit below the zone's latest accepted
  // sequence and every one of those readings would be rejected as out of
  // order — and queueing them would only replay the same rejection later.
  if (!sequenceSeeded) {
    return;
  }

  const ReadingSnapshot reading = createSnapshot(now);
  printSerialReport(reading, now);

  // Send directly while healthy. NVS is touched only when a retry is needed,
  // limiting flash wear during normal two-second publishing.
  if (outbox.empty() && WiFi.status() == WL_CONNECTED &&
      deadlineReached(now, nextBackendAttemptMs)) {
    if (sendReading(reading, now)) {
      return;
    }
  }
  outbox.enqueue(reading);
}

void processOutbox(uint32_t now) {
  if (outbox.empty() || WiFi.status() != WL_CONNECTED ||
      !deadlineReached(now, nextBackendAttemptMs)) {
    return;
  }

  const ReadingSnapshot* reading = outbox.front();
  if (reading != nullptr && sendReading(*reading, now)) {
    outbox.pop();
    Serial.printf("[OUTBOX] Delivered buffered reading; %u remain\n",
                  outbox.size());
  }
}

void sendHeartbeat(uint32_t now) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // heartbeatSchema is `.strict()` and accepts nothing but an optional
  // `sentAt`. Node identity comes from the API key, not the body, so the
  // telemetry the old example server wanted here would now be a 400.
  JsonDocument document;
  char timestamp[21];
  if (formatTimestamp(currentEpochSeconds(), timestamp, sizeof(timestamp))) {
    document["sentAt"] = timestamp;
  }

  String payload;
  serializeJson(document, payload);
  if (postJson(zoneUrl("/heartbeat"), payload, false, activeZoneIndex)) {
    registerBackendSuccess(now);
  } else {
    Serial.println("[HEARTBEAT] Backend did not accept heartbeat");
  }
}

void configurePins() {
  // The powered IR receiver drives GPIO34 and idles HIGH, so no internal pull
  // resistor is required (GPIO34 does not provide one in any case).
#ifdef MULTI_ZONE_NODE
  // Every zone's sensors are physically present on the shared board, so all
  // pins are configured regardless of which room is selected; sampleSensors()
  // still gates on the active zone's channels.
  pinMode(AppConfig::PIN_ZONE_SELECT, INPUT_PULLUP);
  constexpr bool WIRE_ALL = true;
#else
  constexpr bool WIRE_ALL = false;
#endif

  if (WIRE_ALL || REPORTS_FIRE) {
    pinMode(AppConfig::PIN_FLAME, INPUT);
    attachInterrupt(digitalPinToInterrupt(AppConfig::PIN_FLAME),
                    onFlameIrActivity, FALLING);
  }
  if (WIRE_ALL || REPORTS_OCCUPANCY) {
    pinMode(AppConfig::PIN_MOTION, INPUT);
  }

  analogReadResolution(12);
  if (WIRE_ALL || REPORTS_GAS) {
    pinMode(AppConfig::PIN_GAS, INPUT);
    // The comparator output is only driven while it is asserted, so a bare
    // INPUT floats and reads as a random alarm. Bias it to the inactive level
    // for whichever polarity this module uses.
    pinMode(AppConfig::PIN_GAS_DIGITAL,
            AppConfig::GAS_DIGITAL_ACTIVE_LOW ? INPUT_PULLUP : INPUT_PULLDOWN);
    analogSetPinAttenuation(AppConfig::PIN_GAS, ADC_11db);
  }
  if (WIRE_ALL || REPORTS_WATER) {
    pinMode(AppConfig::PIN_WATER, INPUT);
    analogSetPinAttenuation(AppConfig::PIN_WATER, ADC_11db);
  }
}

void initializeWatchdog() {
  const esp_err_t initResult =
      esp_task_wdt_init(AppConfig::WATCHDOG_TIMEOUT_SECONDS, true);
  const esp_err_t addResult = esp_task_wdt_add(nullptr);
  if (initResult != ESP_OK || addResult != ESP_OK) {
    Serial.printf("[WDT] Initialization warning: init=%d add=%d\n", initResult,
                  addResult);
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.println("\nIndustrial Smart Safety Node starting...");

  configurePins();
  alarmManager.begin();
  outbox.begin();
  initializeWatchdog();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  bootId = esp_random();
  randomSeed(bootId);

  const uint32_t now = millis();
  sampleSensors(now);
  // No backend contact yet, so the local machine holds the actuators.
  alarmManager.update(commandedState, false, liveReadings.state, now);
  nextWifiAttemptMs = now;
  nextBackendAttemptMs = now;
  lastPublishMs = now - AppConfig::PUBLISH_INTERVAL_MS;
  lastHeartbeatMs = now;
  lastCommandPollMs = now;
}

void loop() {
  const uint32_t now = millis();
  esp_task_wdt_reset();

  manageWifi(now);
  seedSequenceFromClock();
#ifdef MULTI_ZONE_NODE
  pollZoneSelectButton(now);
#endif

  if (intervalElapsed(now, lastSensorSampleMs, AppConfig::SENSOR_SAMPLE_MS)) {
    sampleSensors(now);
  }
  enforceSensorTimeout(now);
  alarmManager.update(commandedState, backendIsAuthoritative(now),
                      liveReadings.state, now);

  if (intervalElapsed(now, lastPublishMs, AppConfig::PUBLISH_INTERVAL_MS)) {
    lastPublishMs = now;
    publishReading(now);
  }

  processOutbox(now);

  if (intervalElapsed(now, lastCommandPollMs, AppConfig::COMMAND_POLL_MS)) {
    lastCommandPollMs = now;
    if (WiFi.status() == WL_CONNECTED) {
      pollCommands(now);
    }
  }

  if (intervalElapsed(now, lastHeartbeatMs,
                      AppConfig::HEARTBEAT_INTERVAL_MS)) {
    lastHeartbeatMs = now;
    sendHeartbeat(now);
  }

  // Yield to the Wi-Fi stack without introducing blocking application delays.
  delay(2);
}
