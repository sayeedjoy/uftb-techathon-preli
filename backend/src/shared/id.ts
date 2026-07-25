import { randomBytes, randomUUID } from "node:crypto"

export function newId(): string {
  return randomUUID()
}

/** URL-safe opaque token used for zone API keys. */
export function newApiKey(prefix = "zk"): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`
}

export function newEventId(): string {
  return randomUUID()
}
