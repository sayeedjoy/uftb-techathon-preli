import { pino, type Logger } from "pino"

import { env, isProduction, isTest } from "./env.js"

/**
 * Redaction list is not optional decoration — a leaked zone API key in a demo
 * log is a real credential leak. Everything sensitive is replaced before it can
 * reach a transport.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers['x-zone-api-key']",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "headers.authorization",
  "headers['x-zone-api-key']",
  "authorization",
  "apiKey",
  "apiKeyHash",
  "password",
  "passwordHash",
  "token",
  "*.password",
  "*.passwordHash",
  "*.apiKey",
  "*.token",
  "body.password",
]

export const logger: Logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
  base: { service: "scsrg-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction || isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service",
          },
        },
      }),
})

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings)
}
