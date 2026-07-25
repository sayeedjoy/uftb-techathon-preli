import type {
  DashboardSummaryDto,
  IncidentSummaryDto,
  PriorityQueueEntryDto,
  ZoneSummaryDto,
} from "@scsrg/shared"

export function zoneFixture(
  overrides: Partial<ZoneSummaryDto> = {}
): ZoneSummaryDto {
  return {
    id: "zone-1",
    code: "iot-lab",
    name: "IoT Lab",
    description: null,
    location: "Building A",
    assetImportance: 5,
    state: "SAFE",
    currentRiskScore: 12.5,
    contributions: { fire: 0, gas: 12.5, water: 0, occupancy: 0 },
    reasons: ["Gas level is 50% of configured range (+12.5)"],
    lastSeenAt: new Date().toISOString(),
    lastReadingAt: new Date().toISOString(),
    isActive: true,
    maintenanceMode: false,
    sensors: [
      {
        type: "FLAME",
        name: "Flame detector",
        status: "ONLINE",
        isCritical: true,
        lastSeenAt: new Date().toISOString(),
      },
      {
        type: "GAS",
        name: "Gas sensor",
        status: "ONLINE",
        isCritical: false,
        lastSeenAt: new Date().toISOString(),
      },
      {
        type: "OCCUPANCY",
        name: "Occupancy sensor",
        status: "ONLINE",
        isCritical: false,
        lastSeenAt: new Date().toISOString(),
      },
    ],
    sensorValues: {
      fireDetected: false,
      fireSignal: 0,
      gasLevel: 0.5,
      waterLevel: null,
      waterPhase: null,
      occupancyDetected: false,
    },
    actuators: {
      led: "GREEN",
      buzzerActive: false,
      relayCutoffActive: false,
      updatedAt: new Date().toISOString(),
    },
    activeIncident: null,
    trend: null,
    trendSlope: null,
    ...overrides,
  }
}

export function priorityEntryFixture(
  overrides: Partial<PriorityQueueEntryDto> = {}
): PriorityQueueEntryDto {
  return {
    rank: 1,
    incidentId: "incident-1",
    zoneId: "zone-1",
    zoneCode: "iot-lab",
    zoneName: "IoT Lab",
    status: "OPEN",
    riskScore: 84,
    priorityScore: 112,
    occupancy: "OCCUPIED",
    criticalDurationSeconds: 48,
    mainHazard: "FIRE",
    dominantHazards: ["FIRE", "GAS"],
    acknowledged: false,
    acknowledgedByName: null,
    startedAt: new Date(Date.now() - 48_000).toISOString(),
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
    ],
    ...overrides,
  }
}

export function incidentFixture(
  overrides: Partial<IncidentSummaryDto> = {}
): IncidentSummaryDto {
  return {
    id: "incident-1",
    zoneId: "zone-1",
    zoneCode: "iot-lab",
    zoneName: "IoT Lab",
    status: "OPEN",
    startedAt: new Date(Date.now() - 48_000).toISOString(),
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    acknowledgedByName: null,
    resolvedAt: null,
    durationSeconds: null,
    maximumRiskScore: 84,
    currentRiskScore: 84,
    dominantHazards: ["FIRE", "GAS"],
    mainHazard: "FIRE",
    priorityScore: 112,
    createdAt: new Date(Date.now() - 48_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function summaryFixture(
  overrides: Partial<DashboardSummaryDto> = {}
): DashboardSummaryDto {
  return {
    serverTime: new Date().toISOString(),
    totalZones: 3,
    connectedZones: 3,
    stateCounts: { SAFE: 2, WARNING: 0, CRITICAL: 1, OFFLINE: 0 },
    activeIncidents: 1,
    unacknowledgedIncidents: 1,
    offlineZones: 0,
    highestPriorityIncident: priorityEntryFixture(),
    health: {
      backendStatus: "OK",
      databaseConnected: true,
      socketConnections: 1,
      offlineZoneCount: 0,
      failedActuationCount: 0,
      recentValidationFailureCount: 0,
    },
    ...overrides,
  }
}
