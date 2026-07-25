# Security

## Two credential types, deliberately non-interchangeable

| Credential | Who holds it | Reaches |
|---|---|---|
| JWT (`Authorization: Bearer`) | Dashboard users | Everything except `/ingestion/*` |
| Zone API key (`X-Zone-API-Key`) | Sensor nodes | `/ingestion/*`, **for that zone only** |

A JWT can never satisfy the zone-key middleware, and a zone key can never
satisfy a JWT-guarded route. Both directions are asserted by integration tests.
A valid key for zone A used against zone B is rejected, because the zone is
resolved from the route parameter, not from the key.

## RBAC

Enforced in `authorization.middleware.ts` on every admin route. Hiding a nav
item is a courtesy; the backend refusing the call is the mechanism.

| Capability | `SECURITY_STAFF` | `ADMIN` |
|---|---|---|
| Log in, view profile | ✅ | ✅ |
| View zones, priority queue, incidents, history | ✅ | ✅ |
| Acknowledge incidents | ✅ | ✅ |
| Submit a field report | ✅ | ✅ |
| Confirm a field report | ❌ 403 | ✅ |
| Manual overrides | ❌ 403 | ✅ |
| System health | ❌ 403 | ✅ |
| Create / edit zones and sensors | ❌ 403 | ✅ |
| Rotate a zone API key | ❌ 403 | ✅ |
| Raw historical readings | ❌ 403 | ✅ |
| Manage users and roles | ❌ 403 | ✅ |
| Audit logs | ❌ 403 | ✅ |
| Simulator | ❌ 403 | ✅ |

`admin-rbac.test.ts` asserts a `SECURITY_STAFF` token receives `403` on every one
of these, including the zone-scoped routes, even though the UI hides them.

## Credentials at rest

- **Passwords:** bcrypt at cost 12 (`BCRYPT_ROUNDS`).
- **Zone API keys:** bcrypt-hashed. The plaintext exists only at generation, is
  printed once, and is written to two gitignored files
  (`backend/.dev-zone-keys.json`, `backend/.env.simulator`). A hash is never
  presented as a usable credential; if you lose the plaintext, rotate the key.
- **Key rotation:** `POST /admin/zones/:zoneId/credentials` revokes the previous
  credential and issues a new one in a single transaction, returning the
  plaintext once and invalidating the verification cache immediately.

### The bcrypt-on-the-hot-path tradeoff

bcrypt is intentionally slow, which is right for a login form and wrong for a
path carrying 150 readings a second. Measured: ~250 ms per verification, which
collapsed sustained throughput below one reading per second.

The resolution is a short-lived verified-key cache. bcrypt gates the **first**
presentation of a key; the result is then cached for 60 seconds against a
SHA-256 digest of the same key, compared with `timingSafeEqual`. What this does
and does not change:

- Keys are still stored **only** as bcrypt hashes. Nothing reversible is
  persisted.
- An attacker guessing keys still pays full bcrypt cost per guess, because a
  wrong key never enters the cache.
- A revoked or rotated key stops working immediately (rotation clears the cache)
  and otherwise within 60 seconds.

## Login hardening

- Rate-limited to `RATE_LIMIT_AUTH_PER_MIN` (5) per IP.
- An unknown email and a wrong password return the **identical** status, code
  and message, and both burn a comparable amount of time — a bcrypt comparison
  runs against a dummy hash when no user exists. The endpoint cannot be used to
  enumerate accounts.
- `passwordHash` never appears in a response body or a log line.

## Transport and request hardening

| Control | Setting |
|---|---|
| Helmet | Enabled with a CSP that permits Swagger UI's inline assets and nothing else. |
| CORS | Explicit allowlist from `CORS_ORIGINS`. A wildcard is never combined with credentials. |
| Body size | 1 MB, JSON and urlencoded. Oversized bodies become `413 PAYLOAD_TOO_LARGE`. |
| Rate limits | auth 5/min/IP · dashboard API 300/min/IP · ingestion 1 200/min **per zone**. |
| Error responses | Envelope only. Stack traces never leave the process in production. |
| `x-powered-by` | Disabled. |

Ingestion is rate-limited per zone rather than per IP: thirty nodes behind one
campus NAT sharing a single bucket would throttle each other, which is the wrong
behaviour for the busiest path in the system.

## Log redaction

`authorization`, `x-zone-api-key`, `cookie`, `set-cookie`, `password`,
`passwordHash`, `apiKey`, `apiKeyHash` and `token` are replaced with
`[Redacted]` before any transport sees them — including nested occurrences. A
leaked zone key in a demo log is a real credential leak.

## Audit trail

Every state-changing admin action and every acknowledgment writes an `AuditLog`
row with the user, the action, the entity, structured metadata, the client IP
and the timestamp. Overrides additionally write a `ManualOverride` row and an
incident timeline entry, and any resulting actuation command is tagged
`source: MANUAL_OVERRIDE` so a human decision is never mistaken for an automatic
one.

## Known tradeoff: token storage

The access token is a 60-minute JWT held in `localStorage`.

- **Why:** the API surface defined by the brief has `login` and `me` and no
  refresh endpoint. `localStorage` survives a reload without one.
- **The cost:** an XSS vulnerability can read the token. `httpOnly` cookies
  cannot be read by injected script.
- **What would change it:** a short-lived access token in memory plus an
  `httpOnly`, `SameSite=Strict` refresh cookie with rotation and reuse
  detection. That needs a refresh endpoint, CSRF protection on it, and a
  server-side token store — a larger surface than this prototype's contract
  admits.

This is recorded as a decision, not an oversight. For a hackathon prototype with
seeded development accounts the exposure is acceptable; for a real deployment it
is the first thing to change.

## Never

- Trust a client-supplied `riskScore`, `state`, `priority` or `incidentStatus`.
- Enforce authorisation only in the frontend.
- Return a hash where a credential is expected.
- Let predicted risk (bonus 2) or an AI-extracted report (bonus 3) trigger
  actuation or set a zone state.
- Commit `.env`, `.dev-zone-keys.json` or `.env.simulator` — all three are
  gitignored, and the ignore rules were added before the seed that writes them.
