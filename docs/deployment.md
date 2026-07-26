# Deployment

How to run SCS-RG somewhere other than a laptop. For local development see the
[README](../README.md); for things that go wrong see
[troubleshooting.md](troubleshooting.md).

There are three deployable pieces: a **Postgres database**, the **backend**
(Express + Socket.IO, containerised), and the **frontend** (a static bundle).
`packages/shared` is not deployed — it compiles into both.

---

## 1. What must change before production

The defaults are tuned for a demo on one machine. These are not.

| Setting                   | Dev default             | Production                                     |
| ------------------------- | ----------------------- | ---------------------------------------------- |
| `JWT_SECRET`              | the placeholder         | ≥32 random characters, from a secret manager   |
| `POSTGRES_PASSWORD`       | `scsrg`                 | generated, never in the repo                   |
| `CORS_ORIGINS`            | `http://localhost:5173` | your real dashboard origin, comma-separated    |
| `BCRYPT_ROUNDS`           | 12                      | 12 is fine; the test suite drops it to 4       |
| `GAS_WARMUP_MS`           | 30000                   | keep 30000 — an MQ-2 means nothing before that |
| `ZONE_OFFLINE_TIMEOUT_MS` | 10000                   | raise it above your real reporting interval    |
| `LOG_LEVEL`               | `debug`                 | `info`                                         |
| `AI_PROVIDER` + keys      | optional                | server-side only; never expose to the browser  |

`CORS_ORIGINS` rejects a wildcard when credentials are enabled — that is
deliberate, so list origins explicitly. The process is Zod-validated at boot and
**refuses to start** on an invalid value rather than running misconfigured; read
the error, it names the key.

---

## 2. Database

Postgres 18. Locally it is bound to host port **5433** because a local install
usually owns 5432; in production use whatever your provider gives you and set
`DATABASE_URL` accordingly.

```bash
# schema — safe to run repeatedly, applies only what is pending
pnpm --filter backend exec prisma migrate deploy
```

`migrate deploy` does **not** generate the Prisma client. The container does both
(see below); if you run the backend outside a container, run
`pnpm --filter backend exec prisma generate` after installing.

One migration is hand-written and load-bearing:
`prisma/migrations/20260724192500_partial_unique_indexes/migration.sql` creates
the partial unique index enforcing **one active incident per zone**. Prisma's DSL
cannot express it. If it is missing, the application still catches the violation
it can no longer rely on — verify it exists after any schema surgery:

```sql
\d "Incident"   -- expect incident_one_active_per_zone
```

`DATABASE_POOL_SIZE` defaults to 25, sized for the 30-zone load scenario. Raise
it with zone count, and keep it under your database's connection limit.

---

## 3. Backend

The container is the supported path. Build context is the **repository root**,
because the backend depends on the `@scsrg/shared` workspace package.

```bash
docker compose --profile app up -d --build
```

The image is multi-stage: it builds `@scsrg/shared`, generates the Prisma client,
compiles the backend, then discards dev dependencies. It runs as a non-root user,
exposes `4000`, has a `HEALTHCHECK` against `/health`, and applies migrations on
start so a fresh container converges on the schema by itself.

Without Docker:

```bash
pnpm install
pnpm --filter @scsrg/shared build
pnpm --filter backend exec prisma generate
pnpm --filter backend build
pnpm --filter backend exec prisma migrate deploy
node backend/dist/server.js
```

Point liveness and readiness probes at **`GET /health`**, which reports process
status, uptime and version without authentication.

### Behind a reverse proxy

Socket.IO needs the WebSocket upgrade forwarded. Terminate TLS at the proxy and
pass through `Upgrade` and `Connection` headers, or the dashboard silently falls
back to polling and reconnect behaviour degrades.

---

## 4. Frontend

A static bundle — any static host or CDN.

```bash
pnpm --filter @scsrg/shared build
pnpm --filter frontend build          # → frontend/dist
```

**Vite inlines `VITE_*` variables at build time, not at run time.** Set them
before building, not on the server:

| Variable                   | Value                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `VITE_API_BASE_URL`        | `/api/v1` if same-origin behind a proxy, else the full URL |
| `VITE_SOCKET_URL`          | empty for same-origin, else the backend's origin           |
| `VITE_ALERT_SOUND_ENABLED` | `false` unless you want audio in a control room            |

Serving the dashboard on the same origin as the API, with the proxy routing
`/api` to the backend, is the simplest correct setup: it keeps cookies and CORS
uncomplicated. If you serve it elsewhere, that origin must be in `CORS_ORIGINS`.

The bundle is a single-page app — configure the host to rewrite unknown paths to
`index.html`, or deep links like `/incidents?incidentId=…` will 404.

---

## 5. Zone credentials

Zone API keys are **bcrypt-hashed in the database**; the plaintext is shown once,
by the seed, and written to gitignored files. There is no recovery path — a lost
key is rotated, not retrieved.

`pnpm db:seed` is for development. It rotates every key, which is exactly what
you do not want in production. For a real deployment, provision zones and issue
credentials deliberately, distribute each key to its node over a channel you
trust, and rotate on a schedule.

**No zone API key ever reaches the browser.** The dashboard authenticates with a
JWT and cannot satisfy `requireZoneApiKey`; the simulator drives the real HTTP
API from the server using server-held keys.

---

## 6. Firmware

Point the node at the deployed API in `firmware/include/app_config.h`:

```cpp
static constexpr char API_BASE_URL[] = "https://scsrg.example.edu/api/v1";
```

⚠️ **The HTTP client does not configure certificate validation.** Sending a zone
API key over a connection it will not verify is worse than plain HTTP, because it
looks secure. Before using HTTPS, give the client a CA bundle or pin the
certificate. See [circuit-diagram.md](circuit-diagram.md) and
[firmware/README.md](../firmware/README.md).

Credentials live in `firmware/include/zone_secrets.h`, which is gitignored and
generated by `pnpm firmware:config -- --write`.

---

## 7. Backups and retention

```bash
pnpm db:backup                     # timestamped pg_dump into backups/
pnpm --filter backend retention    # dry run
```

A scheduled `pg_dump` to storage on a different failure domain is the minimum.
Recovery is `psql < dump`; what you lose is everything since the last dump, which
is why the interval is a policy decision rather than a technical one.

---

## 8. Scaling past one instance

Today the backend is **a single process by design**, and that is the honest
constraint to state.

Every in-memory map — debounce counters, gas warm-up, occupancy, water phase,
recovery counters — is a cache rebuilt from Postgres at boot by `src/bootstrap/`
before the HTTP listener binds. That makes a restart safe. It does **not** make
two concurrent instances safe: each would keep its own debounce counters, so a
zone's five consecutive flame readings could be split across instances and never
confirm a fire.

To run more than one instance you would need to:

1. **Move the counters out of process** — Redis, or a small table — so debounce
   and warm-up state is shared rather than duplicated.
2. **Add the Socket.IO Redis adapter**, so a broadcast from one instance reaches
   clients connected to another, and enable sticky sessions at the proxy.
3. **Elect a single sweeper.** The offline heartbeat monitor must run once, not
   once per instance, or zones flap.
4. **Partition ingestion by zone** if throughput demands it — the per-zone
   sequence ordering is what makes this safe to shard.

The database side scales first and cheaply: the hot queries are indexed, and
readings are the only table that grows without bound — see
the retention section of
[SCS-RG-System-Documentation.pdf](SCS-RG-System-Documentation.pdf).

Until then, scale vertically and keep one backend. A single Node process
comfortably handles the 30-zone load scenario (`pnpm sim:load -- --zones 30
--hz 5`) with no dropped readings.
