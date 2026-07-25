import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Prisma, PrismaClient, SensorType } from "@prisma/client"

import { hashApiKey } from "../../src/modules/auth/password.util.js"
import { newApiKey } from "../../src/shared/id.js"

const BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

type SeedSensor = {
  type: SensorType
  name: string
  isCritical: boolean
  configuration: Record<string, unknown>
}

type SeedZone = {
  code: string
  name: string
  description: string
  location: string
  assetImportance: number
  sensors: SeedSensor[]
}

/**
 * The three campus zones from the brief.
 *
 * Everything the risk pipeline needs is data, not code: a fourth zone is a row
 * in this array (or a `POST /admin/zones` call) and needs no code change.
 * A sensor type absent here contributes 0 and is rejected on ingestion.
 */
export const SEED_ZONES: SeedZone[] = [
  {
    code: "iot-lab",
    name: "IoT Lab",
    description:
      "Prototyping bench with soldering stations, high student throughput.",
    location: "Building A · Level 2",
    assetImportance: 5,
    sensors: [
      {
        type: "FLAME",
        name: "Bench flame detector",
        isCritical: true,
        configuration: { model: "IR-flame-v2" },
      },
      {
        type: "GAS",
        name: "Solder fume / VOC sensor",
        isCritical: false,
        configuration: { model: "MQ-135", warmupMsOverride: null },
      },
      {
        type: "OCCUPANCY",
        name: "PIR occupancy sensor",
        isCritical: false,
        configuration: { model: "PIR-HC-SR501" },
      },
    ],
  },
  {
    code: "server-room",
    name: "Server Room",
    description:
      "Core network and compute racks. Low occupancy, highest asset value.",
    location: "Building A · Basement",
    assetImportance: 8,
    sensors: [
      {
        type: "FLAME",
        name: "Rack flame detector",
        isCritical: true,
        configuration: { model: "IR-flame-v2" },
      },
      {
        type: "WATER",
        name: "Under-floor water level probe",
        isCritical: false,
        configuration: { model: "WL-2", mountHeightMm: 40 },
      },
      {
        type: "OCCUPANCY",
        name: "Door occupancy sensor",
        isCritical: false,
        configuration: { model: "PIR-HC-SR501" },
      },
    ],
  },
  {
    code: "robotics-lab",
    name: "Robotics Lab",
    description:
      "LiPo charging bay and fabrication tools. Moderate occupancy.",
    location: "Building B · Level 1",
    assetImportance: 6,
    sensors: [
      {
        type: "FLAME",
        name: "Fabrication flame detector",
        isCritical: true,
        configuration: { model: "IR-flame-v2" },
      },
      {
        type: "GAS",
        name: "Battery off-gassing sensor",
        isCritical: false,
        configuration: { model: "MQ-2" },
      },
      {
        type: "OCCUPANCY",
        name: "Ceiling occupancy sensor",
        isCritical: false,
        configuration: { model: "PIR-HC-SR501" },
      },
    ],
  },
]

/**
 * Seeds zones, sensors and one API credential each.
 *
 * The plaintext key exists only here: it is bcrypt-hashed into the database and
 * written to two gitignored files so the simulator can use it. A hash is never
 * presented as a usable credential.
 */
export async function seedZones(
  prisma: PrismaClient
): Promise<Record<string, string>> {
  const keys: Record<string, string> = {}

  for (const definition of SEED_ZONES) {
    const zone = await prisma.zone.upsert({
      where: { code: definition.code },
      update: {
        name: definition.name,
        description: definition.description,
        location: definition.location,
        assetImportance: definition.assetImportance,
        isActive: true,
      },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        location: definition.location,
        assetImportance: definition.assetImportance,
        state: "OFFLINE",
        currentRiskScore: 0,
        contributions: { fire: 0, gas: 0, water: 0, occupancy: 0 },
        reasons: ["No readings received yet"],
      },
    })

    for (const sensor of definition.sensors) {
      await prisma.sensor.upsert({
        where: { zoneId_type: { zoneId: zone.id, type: sensor.type } },
        update: {
          name: sensor.name,
          isCritical: sensor.isCritical,
          configuration: sensor.configuration as Prisma.InputJsonObject,
        },
        create: {
          zoneId: zone.id,
          type: sensor.type,
          name: sensor.name,
          isCritical: sensor.isCritical,
          configuration: sensor.configuration as Prisma.InputJsonObject,
          status: "OFFLINE",
        },
      })
    }

    // Rotate the key on every seed: the previous plaintext is unrecoverable,
    // so keeping the old hash around would leave an unusable credential.
    const apiKey = newApiKey(definition.code.replace(/-/g, ""))
    await prisma.zoneCredential.deleteMany({ where: { zoneId: zone.id } })
    await prisma.zoneCredential.create({
      data: {
        zoneId: zone.id,
        apiKeyHash: await hashApiKey(apiKey),
        label: "development",
      },
    })

    keys[definition.code] = apiKey
    console.log(
      `  • zone ${definition.code} (${definition.sensors.length} sensors, asset importance ${definition.assetImportance})`
    )
  }

  writeZoneKeyFiles(keys)
  return keys
}

/** Both targets are gitignored (see .gitignore, added before this seed existed). */
function writeZoneKeyFiles(keys: Record<string, string>): void {
  writeFileSync(
    path.join(BACKEND_ROOT, ".dev-zone-keys.json"),
    `${JSON.stringify(
      {
        warning:
          "DEVELOPMENT ONLY. Regenerated on every `pnpm db:seed`. Never commit.",
        generatedAt: new Date().toISOString(),
        keys,
      },
      null,
      2
    )}\n`,
    "utf8"
  )

  const envLines = [
    "# DEVELOPMENT ONLY — generated by `pnpm db:seed`. Never commit.",
    "# Read server-side by the simulator engine; never sent to a browser.",
    ...Object.entries(keys).map(
      ([code, key]) => `SIM_ZONE_KEY_${code.toUpperCase().replace(/-/g, "_")}=${key}`
    ),
    "",
  ]
  writeFileSync(
    path.join(BACKEND_ROOT, ".env.simulator"),
    envLines.join("\n"),
    "utf8"
  )
}
