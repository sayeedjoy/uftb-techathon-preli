import { z } from "zod"

import { loadEnvFile } from "./dotenv.js"

// Populate process.env from backend/.env before anything reads it.
// Values already present in the environment always win.
loadEnvFile()

/**
 * Environment parsing. Every value the system depends on is declared here and
 * validated at boot, so the process refuses to start on a bad value rather than
 * failing halfway through a demo with an undefined threshold.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : /^(1|true|yes|on)$/i.test(value.trim())
  )

const port = z.coerce.number().int().min(1).max(65_535)
const positiveInt = z.coerce.number().int().positive()
const nonNegativeInt = z.coerce.number().int().nonnegative()

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: port.default(4000),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    TEST_DATABASE_URL: z.string().min(1).optional(),
    DATABASE_POOL_SIZE: positiveInt.default(15),

    JWT_SECRET: z
      .string()
      .min(32, "JWT_SECRET must be at least 32 characters long"),
    JWT_EXPIRES_IN: z.string().min(2).default("60m"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("debug"),

    // Risk fusion
    RISK_WEIGHT_FIRE: z.coerce.number().min(0).max(100).default(40),
    RISK_WEIGHT_GAS: z.coerce.number().min(0).max(100).default(25),
    RISK_WEIGHT_WATER: z.coerce.number().min(0).max(100).default(20),
    RISK_WEIGHT_OCCUPANCY: z.coerce.number().min(0).max(100).default(15),
    RISK_THRESHOLD_WARNING: z.coerce.number().min(0).max(100).default(30),
    RISK_THRESHOLD_CRITICAL: z.coerce.number().min(0).max(100).default(65),
    STATE_HYSTERESIS: z.coerce.number().min(0).max(50).default(5),
    RECOVERY_CONSECUTIVE_READINGS: positiveInt.default(3),

    // Sensor processing
    FIRE_DEBOUNCE_CONSECUTIVE: positiveInt.default(5),
    FIRE_CLEAR_CONSECUTIVE: positiveInt.default(5),
    GAS_WARMUP_MS: nonNegativeInt.default(5_000),
    OCCUPANCY_DEBOUNCE_READINGS: positiveInt.default(3),
    MAX_FUTURE_TIMESTAMP_SKEW_MS: nonNegativeInt.default(5_000),

    // Offline detection
    ZONE_OFFLINE_TIMEOUT_MS: positiveInt.default(10_000),
    ZONE_OFFLINE_SWEEP_MS: positiveInt.default(2_000),

    // Priority ranking
    PRIORITY_OCCUPANCY_BONUS: z.coerce.number().min(0).default(10),
    PRIORITY_DURATION_BONUS_MAX: z.coerce.number().min(0).default(10),
    PRIORITY_MULTI_HAZARD_BONUS: z.coerce.number().min(0).default(5),
    PRIORITY_ACKNOWLEDGED_PENALTY: z.coerce.number().min(0).default(15),
    PRIORITY_HUMAN_REPORT_BONUS_MAX: z.coerce.number().min(0).default(5),

    // Simulator
    SIM_DEFAULT_INTERVAL_MS: positiveInt.default(500),
    SIM_MAX_ZONES: positiveInt.default(40),
    SIM_INGESTION_BASE_URL: z.string().default("http://localhost:4000/api/v1"),

    // Rate limits (per minute)
    RATE_LIMIT_AUTH_PER_MIN: positiveInt.default(5),
    RATE_LIMIT_API_PER_MIN: positiveInt.default(300),
    RATE_LIMIT_INGESTION_PER_MIN: positiveInt.default(1_200),

    // Bonus features
    TREND_WINDOW_READINGS: positiveInt.default(20),
    TREND_HORIZON_S: positiveInt.default(60),
    PREDICTION_ENABLED: booleanish.default(true),
    AI_PROVIDER: z.enum(["none", "anthropic"]).default("none"),
    ANTHROPIC_API_KEY: z.string().optional(),
  })
  .refine(
    (value) => value.RISK_THRESHOLD_WARNING < value.RISK_THRESHOLD_CRITICAL,
    {
      message:
        "RISK_THRESHOLD_WARNING must be below RISK_THRESHOLD_CRITICAL",
      path: ["RISK_THRESHOLD_WARNING"],
    }
  )
  .refine(
    (value) => value.FIRE_DEBOUNCE_CONSECUTIVE >= 1,
    { message: "FIRE_DEBOUNCE_CONSECUTIVE must be at least 1" }
  )

export type Env = z.infer<typeof envSchema>

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n")
}

/**
 * Parses `process.env`. On failure the process exits non-zero with a readable
 * list of problems — never a stack trace.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    console.error(
      `\nSCS-RG backend refused to start — invalid configuration:\n${formatIssues(
        parsed.error
      )}\n\nSee backend/.env.example for every supported key.\n`
    )
    process.exit(1)
  }

  return parsed.data
}

export const env: Env = loadEnv()

export const isProduction = env.NODE_ENV === "production"
export const isTest = env.NODE_ENV === "test"

/** Parsed CORS allowlist. A wildcard is never permitted with credentials. */
export const corsOrigins: string[] = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0)

/** The connection string the current process should use. */
export const databaseUrl: string =
  isTest && env.TEST_DATABASE_URL ? env.TEST_DATABASE_URL : env.DATABASE_URL

export const API_PREFIX = "/api/v1"
