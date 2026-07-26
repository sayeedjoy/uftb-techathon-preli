#pragma once

// -------------------------------------------------------------------------
// Template for firmware/include/zone_secrets.h — which is GITIGNORED.
//
// Copy this file to zone_secrets.h and fill it in, or let the backend do it:
//
//     pnpm firmware:config --write             # default zone (iot-lab)
//     pnpm firmware:config -- server-room --write
//
// Zone API keys are bcrypt-hashed in the database and printed exactly once by
// `pnpm db:seed`. They rotate on every seed by design, so re-run the generator
// after a reseed rather than trying to recover the old key.
// -------------------------------------------------------------------------
namespace AppConfig {

// The backend addresses zones by UUID: every ingestion route is
// /ingestion/zones/<uuid>/... . ZONE_CODE is only ever printed on the serial
// console, so a mismatch there is cosmetic; a wrong ZONE_UUID is a 401.
static constexpr char ZONE_CODE[] = "iot-lab";
static constexpr char ZONE_UUID[] = "00000000-0000-0000-0000-000000000000";
static constexpr char ZONE_API_KEY[] = "iotlab_replace_me_after_db_seed";

// Which channels this zone may report.
//
// The backend rejects a reading carrying a sensor the zone has no row for with
// 422 SENSOR_NOT_CONFIGURED. That is the contract working, not a bug: it stops
// a miswired node from inventing a hazard channel. The generator derives these
// from the sensors the zone actually has — the seeded `iot-lab` has FLAME, GAS
// and OCCUPANCY but no WATER.
static constexpr bool REPORT_FIRE = true;
static constexpr bool REPORT_GAS = true;
static constexpr bool REPORT_WATER = false;
static constexpr bool REPORT_OCCUPANCY = true;

}  // namespace AppConfig
