import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { SYSTEM_EVENT_SEVERITY, SYSTEM_EVENT_TYPE } from "@scsrg/shared"

import {
  InvalidZoneKeyError,
  NotFoundError,
  ZoneInactiveError,
} from "../shared/errors.js"
import { verifyApiKey } from "../modules/auth/password.util.js"
import {
  findActiveCredentials,
  markCredentialUsed,
} from "../modules/zones/zone-credential.repository.js"
import { findZoneByIdOrCode } from "../modules/zones/zones.repository.js"
import { recordSystemEvent } from "../modules/system-health/system-event.repository.js"
import { pathParam } from "../shared/params.js"

export const ZONE_API_KEY_HEADER = "x-zone-api-key"

/**
 * Verified-key cache.
 *
 * bcrypt is deliberately slow — roughly 250 ms at cost 12 — which is right for
 * a login form and completely wrong for a path that carries 150 readings a
 * second. Thirty nodes at 5 Hz would spend every core doing nothing but key
 * derivation, and the measured throughput collapses to under one reading a
 * second.
 *
 * So bcrypt gates the *first* presentation of a key; the result is then cached
 * for a short window against a SHA-256 digest of the same key, compared in
 * constant time. Keys are still only ever stored as bcrypt hashes, a revoked
 * credential stops working within the TTL, and nothing about the at-rest
 * security changes.
 */
const VERIFIED_KEY_TTL_MS = 60_000

type CachedVerification = {
  digest: Buffer
  credentialId: string
  expiresAt: number
}

const verifiedKeys = new Map<string, CachedVerification[]>()

function digestOf(apiKey: string): Buffer {
  return createHash("sha256").update(apiKey).digest()
}

function findCached(
  zoneId: string,
  digest: Buffer,
  now: number
): string | null {
  const entries = verifiedKeys.get(zoneId)
  if (!entries) return null

  const live = entries.filter((entry) => entry.expiresAt > now)
  if (live.length !== entries.length) verifiedKeys.set(zoneId, live)

  for (const entry of live) {
    if (
      entry.digest.length === digest.length &&
      timingSafeEqual(entry.digest, digest)
    ) {
      return entry.credentialId
    }
  }
  return null
}

function remember(
  zoneId: string,
  digest: Buffer,
  credentialId: string,
  now: number
): void {
  const entries = (verifiedKeys.get(zoneId) ?? []).filter(
    (entry) => entry.expiresAt > now
  )
  entries.push({ digest, credentialId, expiresAt: now + VERIFIED_KEY_TTL_MS })
  verifiedKeys.set(zoneId, entries)
}

/** Called when a key is rotated or revoked so the cache cannot outlive it. */
export function invalidateZoneKeyCache(zoneId?: string): void {
  if (zoneId) verifiedKeys.delete(zoneId)
  else verifiedKeys.clear()
}

/**
 * Sensor-node authentication.
 *
 * A zone key authorises `/ingestion/*` **for that zone only** and nothing else:
 * it can never satisfy a JWT-guarded route, and the key is resolved from the
 * route param so a valid key for zone A cannot be used against zone B.
 *
 * The header value is redacted in every log line (see config/logger.ts).
 */
export async function requireZoneApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const headerValue = req.headers[ZONE_API_KEY_HEADER]
    const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue

    const zoneIdentifier = pathParam(req, "zoneId")
    if (!zoneIdentifier) {
      throw new NotFoundError("No zone was specified.")
    }

    const zone = await findZoneByIdOrCode(zoneIdentifier)
    if (!zone) {
      // Do not reveal whether the zone or the key was wrong.
      throw new InvalidZoneKeyError()
    }

    if (typeof apiKey !== "string" || apiKey.length === 0) {
      await recordSystemEvent({
        type: SYSTEM_EVENT_TYPE.AUTH_FAILURE,
        severity: SYSTEM_EVENT_SEVERITY.WARN,
        message: `Ingestion request for ${zone.code} arrived without an API key`,
        zoneId: zone.id,
      })
      throw new InvalidZoneKeyError("An X-Zone-API-Key header is required.")
    }

    const now = Date.now()
    const digest = digestOf(apiKey)
    let matched = findCached(zone.id, digest, now)

    if (!matched) {
      // Compare against every live credential so a key rotation can overlap
      // without a window of rejected readings.
      const credentials = await findActiveCredentials(zone.id)
      for (const credential of credentials) {
        if (await verifyApiKey(apiKey, credential.apiKeyHash)) {
          matched = credential.id
          remember(zone.id, digest, credential.id, now)
          break
        }
      }
    }

    if (!matched) {
      await recordSystemEvent({
        type: SYSTEM_EVENT_TYPE.AUTH_FAILURE,
        severity: SYSTEM_EVENT_SEVERITY.WARN,
        message: `Rejected ingestion request for ${zone.code}: invalid or revoked API key`,
        zoneId: zone.id,
      })
      throw new InvalidZoneKeyError()
    }

    if (!zone.isActive) {
      throw new ZoneInactiveError(
        `Zone ${zone.code} is deactivated and is not accepting readings.`
      )
    }

    void markCredentialUsed(matched, new Date()).catch(() => undefined)

    req.zone = {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      isActive: zone.isActive,
      maintenanceMode: zone.maintenanceMode,
    }
    next()
  } catch (error) {
    next(error)
  }
}
