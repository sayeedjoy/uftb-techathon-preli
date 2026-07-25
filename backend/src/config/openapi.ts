import { API_PREFIX } from "./env.js"

/**
 * OpenAPI 3.1 document.
 *
 * Hand-authored rather than generated: `zod-openapi` against Zod 4 was
 * timeboxed and the fallback (spec risk R3) is this document, served from the
 * same mount. The endpoint contract is identical either way, and every example
 * below is copied from a real request/response pair.
 */

const envelope = (dataSchema: object) => ({
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", enum: [true] },
    data: dataSchema,
    meta: { type: "object", additionalProperties: true },
  },
})

const errorResponse = {
  description: "Error envelope",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      examples: {
        validation: {
          summary: "Malformed payload",
          value: {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "The request payload is invalid.",
              details: [
                { path: "sensors.gasLevel", message: "Expected number" },
              ],
            },
          },
        },
        outOfRange: {
          summary: "Impossible sensor value",
          value: {
            success: false,
            error: {
              code: "VALUE_OUT_OF_RANGE",
              message: "Gas level must be between 0 and 1 — received 1.5.",
            },
          },
        },
      },
    },
  },
} as const

const commonResponses = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  404: errorResponse,
  409: errorResponse,
  422: errorResponse,
  429: errorResponse,
} as const

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "SCS-RG API",
      version: "1.0.0",
      description: [
        "Multi-Hazard Smart Campus Safety & Response Grid.",
        "",
        "The backend is the sole authority for validation, risk fusion, state",
        "classification, incident lifecycle, priority ranking and actuation.",
        "A sensor node submits **raw readings only** — any payload carrying a",
        "`riskScore`, `state`, `priority` or `incidentStatus` is rejected.",
      ].join("\n"),
    },
    servers: [{ url: API_PREFIX, description: "Versioned API root" }],
    tags: [
      { name: "Auth", description: "Login and the current user" },
      { name: "Zones", description: "Live zone status, history and timeline" },
      { name: "Ingestion", description: "Sensor-node endpoints (zone API key)" },
      { name: "Incidents", description: "Incident lifecycle and acknowledgment" },
      { name: "Priority", description: "Deterministic response ranking" },
      { name: "Dashboard", description: "Summary aggregation" },
      { name: "Admin", description: "Administration, overrides and audit" },
      { name: "Simulator", description: "Demonstration control surface" },
      { name: "Reports", description: "Natural-language field reports" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Dashboard session token from POST /auth/login. Never accepted on /ingestion/*.",
        },
        zoneApiKey: {
          type: "apiKey",
          in: "header",
          name: "X-Zone-API-Key",
          description:
            "Per-zone sensor credential, bcrypt-hashed at rest. Authorises /ingestion/* for that zone only.",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Sign in",
          description: "Rate-limited to 5 requests per minute per IP.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                  },
                },
                example: {
                  email: "admin@scsrg.local",
                  password: "Admin123!",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Signed in",
              content: {
                "application/json": {
                  schema: envelope({ type: "object" }),
                  example: {
                    success: true,
                    data: {
                      token: "eyJhbGciOiJIUzI1NiIs…",
                      expiresIn: "60m",
                      user: {
                        id: "6f0…",
                        name: "Sayeed Joy",
                        email: "admin@scsrg.local",
                        role: "ADMIN",
                        createdAt: "2026-07-25T10:00:00.000Z",
                      },
                    },
                  },
                },
              },
            },
            ...commonResponses,
          },
        },
      },

      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Current user",
          responses: {
            200: { description: "The authenticated user" },
            ...commonResponses,
          },
        },
      },

      "/zones": {
        get: {
          tags: ["Zones"],
          summary: "Every zone's current status in one request",
          responses: {
            200: {
              description: "All zones",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      zones: [
                        {
                          id: "aad…",
                          code: "iot-lab",
                          name: "IoT Lab",
                          state: "WARNING",
                          currentRiskScore: 32.5,
                          contributions: {
                            fire: 0,
                            gas: 17.5,
                            water: 0,
                            occupancy: 15,
                          },
                          reasons: [
                            "Gas level is 70% of configured range (+17.5)",
                            "Zone is currently occupied (+15)",
                          ],
                          actuators: {
                            led: "YELLOW",
                            buzzerActive: false,
                            relayCutoffActive: false,
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            ...commonResponses,
          },
        },
      },

      "/zones/{zoneId}": {
        get: {
          tags: ["Zones"],
          summary: "Zone detail including configuration",
          parameters: [
            {
              name: "zoneId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Zone id or code (`iot-lab` works too).",
            },
          ],
          responses: { 200: { description: "Zone detail" }, ...commonResponses },
        },
      },

      "/zones/{zoneId}/readings": {
        get: {
          tags: ["Zones"],
          summary: "Raw reading history (ADMIN only)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 25 } },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: { 200: { description: "Paginated readings" }, ...commonResponses },
        },
      },

      "/zones/{zoneId}/timeline": {
        get: {
          tags: ["Zones"],
          summary: "State transitions and incidents, merged",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Zone timeline" }, ...commonResponses },
        },
      },

      "/zones/{zoneId}/system-health": {
        get: {
          tags: ["Zones"],
          summary: "Per-zone connectivity (ADMIN only)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Zone health" }, ...commonResponses },
        },
      },

      "/ingestion/zones/{zoneId}/readings": {
        post: {
          tags: ["Ingestion"],
          summary: "Submit one raw sensor reading",
          description: [
            "Runs the full pipeline: semantic validation → duplicate detection →",
            "ordering → normalisation → debounce → risk fusion → persistence →",
            "state transition → incident lifecycle → actuation → broadcast.",
            "",
            "A payload containing `riskScore`, `state`, `priority` or",
            "`incidentStatus` is rejected with 400 — the node is never trusted",
            "with a computed value.",
          ].join("\n"),
          security: [{ zoneApiKey: [] }],
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["readingId", "sequenceNumber", "capturedAt", "sensors"],
                  properties: {
                    readingId: { type: "string" },
                    sequenceNumber: { type: "integer", minimum: 0 },
                    capturedAt: { type: "string", format: "date-time" },
                    sensors: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        fireDetected: { type: "boolean" },
                        gasLevel: { type: "number", minimum: 0, maximum: 1 },
                        waterLevel: { type: "number", minimum: 0, maximum: 1 },
                        occupancyDetected: {
                          type: ["boolean", "null"],
                          description:
                            "null means the sensor is unavailable — never send false to mean 'unknown'.",
                        },
                      },
                    },
                  },
                },
                example: {
                  readingId: "iot-lab-1042",
                  sequenceNumber: 1042,
                  capturedAt: "2026-07-25T10:30:15.000Z",
                  sensors: {
                    fireDetected: true,
                    gasLevel: 0.72,
                    waterLevel: 0,
                    occupancyDetected: true,
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Accepted — returns the backend's own verdict",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      accepted: true,
                      readingId: "iot-lab-1042",
                      validationStatus: "ACCEPTED",
                      appliedToLiveState: true,
                      computation: {
                        riskScore: 72.5,
                        state: "CRITICAL",
                        contributions: {
                          fire: 40,
                          gas: 17.5,
                          water: 0,
                          occupancy: 15,
                        },
                        reasons: [
                          "Sustained flame confirmed after debounce (5 consecutive readings) (+40)",
                          "Gas level is 70% of configured range (+17.5)",
                          "Zone is currently occupied (+15)",
                        ],
                      },
                      zoneState: "CRITICAL",
                      incidentId: "8c1…",
                      actuationCommandIds: ["a1…", "b2…", "c3…"],
                    },
                  },
                },
              },
            },
            ...commonResponses,
          },
        },
      },

      "/ingestion/zones/{zoneId}/heartbeat": {
        post: {
          tags: ["Ingestion"],
          summary: "Report liveness without a reading",
          security: [{ zoneApiKey: [] }],
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "lastSeenAt updated" }, ...commonResponses },
        },
      },

      "/ingestion/zones/{zoneId}/commands": {
        get: {
          tags: ["Ingestion"],
          summary: "Pull pending actuation commands",
          security: [{ zoneApiKey: [] }],
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Pending commands" }, ...commonResponses },
        },
      },

      "/ingestion/zones/{zoneId}/commands/{commandId}/complete": {
        post: {
          tags: ["Ingestion"],
          summary: "Confirm a command was carried out",
          security: [{ zoneApiKey: [] }],
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
            { name: "commandId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: { type: "string", enum: ["COMPLETED", "FAILED"] },
                    message: { type: "string" },
                  },
                },
                example: { status: "COMPLETED" },
              },
            },
          },
          responses: { 200: { description: "Recorded" }, ...commonResponses },
        },
      },

      "/incidents": {
        get: {
          tags: ["Incidents"],
          summary: "Search incidents",
          parameters: [
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "zoneId", in: "query", schema: { type: "string" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"] },
            },
            {
              name: "hazardType",
              in: "query",
              schema: { type: "string", enum: ["FIRE", "GAS", "WATER", "OCCUPANCY"] },
            },
            { name: "acknowledgedBy", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 25 } },
          ],
          responses: { 200: { description: "Paginated incidents" }, ...commonResponses },
        },
      },

      "/incidents/{incidentId}": {
        get: {
          tags: ["Incidents"],
          summary: "Incident detail with timeline, readings and actuation",
          parameters: [
            { name: "incidentId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Incident detail" }, ...commonResponses },
        },
      },

      "/incidents/{incidentId}/timeline": {
        get: {
          tags: ["Incidents"],
          summary: "Ordered timeline events",
          parameters: [
            { name: "incidentId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Timeline" }, ...commonResponses },
        },
      },

      "/incidents/{incidentId}/acknowledge": {
        post: {
          tags: ["Incidents"],
          summary: "Acknowledge an incident",
          description:
            "Concurrency-safe: exactly one of N simultaneous requests returns 200; the rest return 409 ALREADY_ACKNOWLEDGED.",
          parameters: [
            { name: "incidentId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { note: { type: "string", maxLength: 500 } },
                },
                example: { note: "On my way with an extinguisher" },
              },
            },
          },
          responses: {
            200: { description: "Acknowledged by you" },
            ...commonResponses,
          },
        },
      },

      "/priority-queue": {
        get: {
          tags: ["Priority"],
          summary: "Ranked active incidents with explanations",
          responses: {
            200: {
              description: "Deterministically ranked queue",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      queue: [
                        {
                          rank: 1,
                          incidentId: "8c1…",
                          zoneName: "IoT Lab",
                          riskScore: 84,
                          priorityScore: 112,
                          occupancy: "OCCUPIED",
                          criticalDurationSeconds: 48,
                          mainHazard: "FIRE",
                          acknowledged: false,
                          breakdown: {
                            risk: 84,
                            occupancy: 10,
                            duration: 8,
                            asset: 5,
                            multiHazard: 5,
                            acknowledged: 0,
                            humanReport: 0,
                          },
                          reasons: [
                            "Live risk score 84",
                            "Zone is occupied (+10)",
                            "Confirmed fire and gas hazards (+5)",
                            "Critical for 48 seconds (+8)",
                            "High-value zone, asset importance 5 (+5)",
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
            ...commonResponses,
          },
        },
      },

      "/dashboard/summary": {
        get: {
          tags: ["Dashboard"],
          summary: "Everything the top summary bar needs",
          responses: { 200: { description: "Summary" }, ...commonResponses },
        },
      },

      "/admin/zones": {
        post: {
          tags: ["Admin"],
          summary: "Create a zone (ADMIN)",
          description:
            "Returns the plaintext API key exactly once; only its bcrypt hash is stored.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                example: {
                  code: "chem-lab",
                  name: "Chemistry Lab",
                  assetImportance: 6,
                  sensors: [
                    { type: "FLAME", name: "Flame detector", isCritical: true },
                    { type: "GAS", name: "Fume sensor", isCritical: false },
                  ],
                },
              },
            },
          },
          responses: { 201: { description: "Created" }, ...commonResponses },
        },
      },

      "/admin/zones/{zoneId}": {
        patch: {
          tags: ["Admin"],
          summary: "Update a zone (ADMIN)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": { example: { isActive: false } },
            },
          },
          responses: { 200: { description: "Updated" }, ...commonResponses },
        },
      },

      "/admin/zones/{zoneId}/overrides": {
        post: {
          tags: ["Admin"],
          summary: "Apply a manual override (ADMIN)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action", "reason"],
                  properties: {
                    action: {
                      type: "string",
                      enum: [
                        "FORCE_MAINTENANCE_MODE",
                        "CLEAR_MAINTENANCE_MODE",
                        "TEST_ACTUATION",
                        "SILENCE_BUZZER",
                        "RESET_ACTUATION",
                        "MARK_SENSOR_MAINTENANCE",
                        "CLEAR_SENSOR_MAINTENANCE",
                      ],
                    },
                    reason: { type: "string", minLength: 5 },
                  },
                },
                example: {
                  action: "SILENCE_BUZZER",
                  reason: "Confirmed drill — silencing while we investigate",
                },
              },
            },
          },
          responses: { 201: { description: "Override recorded" }, ...commonResponses },
        },
      },

      "/admin/sensors/{sensorId}": {
        patch: {
          tags: ["Admin"],
          summary: "Update a sensor (ADMIN)",
          parameters: [
            { name: "sensorId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Updated" }, ...commonResponses },
        },
      },

      "/admin/system-health": {
        get: {
          tags: ["Admin"],
          summary: "Full system health (ADMIN)",
          responses: { 200: { description: "Health" }, ...commonResponses },
        },
      },

      "/admin/audit-logs": {
        get: {
          tags: ["Admin"],
          summary: "Audit trail (ADMIN)",
          parameters: [
            { name: "userId", in: "query", schema: { type: "string" } },
            { name: "action", in: "query", schema: { type: "string" } },
            { name: "entityType", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          ],
          responses: { 200: { description: "Audit entries" }, ...commonResponses },
        },
      },

      "/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "List users (ADMIN)",
          responses: { 200: { description: "Users" }, ...commonResponses },
        },
      },

      "/admin/users/{userId}/role": {
        patch: {
          tags: ["Admin"],
          summary: "Change a user's role (ADMIN)",
          parameters: [
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { example: { role: "ADMIN" } },
            },
          },
          responses: { 200: { description: "Updated" }, ...commonResponses },
        },
      },

      "/simulator/status": {
        get: {
          tags: ["Simulator"],
          summary: "Simulator and scenario status (ADMIN)",
          responses: { 200: { description: "Status" }, ...commonResponses },
        },
      },

      "/simulator/zones/{zoneId}/start": {
        post: {
          tags: ["Simulator"],
          summary: "Start streaming for a zone (ADMIN)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Started" }, ...commonResponses },
        },
      },

      "/simulator/zones/{zoneId}/stop": {
        post: {
          tags: ["Simulator"],
          summary: "Stop streaming for a zone (ADMIN)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Stopped" }, ...commonResponses },
        },
      },

      "/simulator/zones/{zoneId}/state": {
        patch: {
          tags: ["Simulator"],
          summary: "Patch a simulated zone's sensor state (ADMIN)",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                example: { fireDetected: true, gasLevel: 0.9 },
              },
            },
          },
          responses: { 200: { description: "Patched" }, ...commonResponses },
        },
      },

      "/simulator/scenarios/{scenarioId}/run": {
        post: {
          tags: ["Simulator"],
          summary: "Run a demonstration scenario (ADMIN)",
          parameters: [
            {
              name: "scenarioId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1, maximum: 11 },
            },
          ],
          responses: { 200: { description: "Scenario result" }, ...commonResponses },
        },
      },

      "/reports/natural-language": {
        post: {
          tags: ["Reports"],
          summary: "Submit a free-text field report",
          description:
            "Extraction is deterministic by default. The result is PENDING and influences nothing until an administrator confirms it; it can never create an incident or trigger actuation.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                example: {
                  text: "Smell of gas near the IoT Lab bench, not sure how bad.",
                },
              },
            },
          },
          responses: { 201: { description: "Report recorded" }, ...commonResponses },
        },
      },

      "/reports/{reportId}/confirm": {
        post: {
          tags: ["Reports"],
          summary: "Confirm a report (ADMIN)",
          parameters: [
            { name: "reportId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Confirmed" }, ...commonResponses },
        },
      },

      "/trend/{zoneId}": {
        get: {
          tags: ["Zones"],
          summary: "Advisory short-term risk trend",
          description:
            "Advisory only. Trend never influences state, incidents, priority or actuation.",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Trend" }, ...commonResponses },
        },
      },

      "/prediction/{zoneId}": {
        get: {
          tags: ["Zones"],
          summary: "Predicted probability of reaching CRITICAL within 60s",
          description:
            "Advisory only, trained on explicitly synthetic data. The prediction module has no import path to actuation or incidents.",
          parameters: [
            { name: "zoneId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "Prediction" }, ...commonResponses },
        },
      },
    },
  }
}

export const openApiDocument = buildOpenApiDocument()
