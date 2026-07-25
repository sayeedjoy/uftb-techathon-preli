-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SECURITY_STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "ZoneState" AS ENUM ('SAFE', 'WARNING', 'CRITICAL', 'OFFLINE');

-- CreateEnum
CREATE TYPE "SensorType" AS ENUM ('FLAME', 'GAS', 'WATER', 'OCCUPANCY');

-- CreateEnum
CREATE TYPE "SensorStatus" AS ENUM ('ONLINE', 'WARMING_UP', 'UNAVAILABLE', 'MAINTENANCE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('ACCEPTED', 'ACCEPTED_OUT_OF_ORDER', 'REJECTED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "HazardType" AS ENUM ('FIRE', 'GAS', 'WATER', 'OCCUPANCY');

-- CreateEnum
CREATE TYPE "IncidentTimelineEventType" AS ENUM ('CREATED', 'RISK_UPDATED', 'STATE_CHANGED', 'ACKNOWLEDGED', 'ACTUATION_ISSUED', 'OVERRIDE_APPLIED', 'ZONE_OFFLINE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActuationType" AS ENUM ('SET_LED', 'ACTIVATE_BUZZER', 'DEACTIVATE_BUZZER', 'ACTIVATE_RELAY', 'DEACTIVATE_RELAY');

-- CreateEnum
CREATE TYPE "ActuationSource" AS ENUM ('SENSOR_TRIGGERED', 'MANUAL_OVERRIDE', 'SYSTEM_RECOVERY');

-- CreateEnum
CREATE TYPE "ActuationStatus" AS ENUM ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedColor" AS ENUM ('GREEN', 'YELLOW', 'RED', 'AMBER_PULSE');

-- CreateEnum
CREATE TYPE "OverrideAction" AS ENUM ('FORCE_MAINTENANCE_MODE', 'CLEAR_MAINTENANCE_MODE', 'TEST_ACTUATION', 'SILENCE_BUZZER', 'RESET_ACTUATION', 'MARK_SENSOR_MAINTENANCE', 'CLEAR_SENSOR_MAINTENANCE');

-- CreateEnum
CREATE TYPE "SystemEventType" AS ENUM ('ZONE_OFFLINE', 'ZONE_ONLINE', 'VALIDATION_FAILURE', 'DUPLICATE_READING', 'OUT_OF_ORDER_READING', 'SENSOR_UNAVAILABLE', 'SENSOR_MAINTENANCE', 'ACTUATION_FAILED', 'BACKEND_STARTED', 'STATE_RECONSTRUCTED', 'MAINTENANCE_MODE', 'AUTH_FAILURE');

-- CreateEnum
CREATE TYPE "SystemEventSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "RiskTrend" AS ENUM ('STABLE', 'RISING', 'FALLING', 'TRENDING_CRITICAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SECURITY_STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "assetImportance" INTEGER NOT NULL DEFAULT 0,
    "state" "ZoneState" NOT NULL DEFAULT 'OFFLINE',
    "currentRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contributions" JSONB NOT NULL DEFAULT '{}',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "lastSeenAt" TIMESTAMP(3),
    "lastReadingAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "ledColor" "LedColor" NOT NULL DEFAULT 'GREEN',
    "buzzerActive" BOOLEAN NOT NULL DEFAULT false,
    "relayCutoffActive" BOOLEAN NOT NULL DEFAULT false,
    "actuatorsUpdatedAt" TIMESTAMP(3),
    "trend" "RiskTrend",
    "trendSlope" DOUBLE PRECISION,
    "trendUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneCredential" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ZoneCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sensor" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "type" "SensorType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SensorStatus" NOT NULL DEFAULT 'OFFLINE',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "warmupStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fireDetected" BOOLEAN,
    "gasLevel" DOUBLE PRECISION,
    "waterLevel" DOUBLE PRECISION,
    "occupancyDetected" BOOLEAN,
    "sensorHealth" JSONB NOT NULL DEFAULT '{}',
    "riskScore" DOUBLE PRECISION NOT NULL,
    "calculatedState" "ZoneState" NOT NULL,
    "contributions" JSONB NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'ACCEPTED',

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneStateTransition" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "previousState" "ZoneState",
    "newState" "ZoneState" NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoneStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "maximumRiskScore" DOUBLE PRECISION NOT NULL,
    "currentRiskScore" DOUBLE PRECISION NOT NULL,
    "dominantHazards" "HazardType"[],
    "priorityScore" DOUBLE PRECISION,
    "priorityExplanation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acknowledgment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "Acknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentTimelineEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "eventType" "IncidentTimelineEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActuationCommand" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "incidentId" TEXT,
    "type" "ActuationType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "source" "ActuationSource" NOT NULL,
    "status" "ActuationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "message" TEXT,

    CONSTRAINT "ActuationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualOverride" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "OverrideAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT,
    "sensorId" TEXT,
    "type" "SystemEventType" NOT NULL,
    "severity" "SystemEventSeverity" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneId" TEXT,
    "rawText" TEXT NOT NULL,
    "hazardType" "HazardType",
    "estimatedSeverity" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmationMessage" TEXT NOT NULL DEFAULT '',
    "extractorProvider" TEXT NOT NULL DEFAULT 'deterministic',
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingHourlyAggregate" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "readings" INTEGER NOT NULL,
    "avgRisk" DOUBLE PRECISION NOT NULL,
    "maxRisk" DOUBLE PRECISION NOT NULL,
    "avgGas" DOUBLE PRECISION,
    "avgWater" DOUBLE PRECISION,
    "fireReadings" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReadingHourlyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");

-- CreateIndex
CREATE INDEX "Zone_state_idx" ON "Zone"("state");

-- CreateIndex
CREATE INDEX "Zone_lastSeenAt_idx" ON "Zone"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Zone_isActive_idx" ON "Zone"("isActive");

-- CreateIndex
CREATE INDEX "ZoneCredential_zoneId_revokedAt_idx" ON "ZoneCredential"("zoneId", "revokedAt");

-- CreateIndex
CREATE INDEX "Sensor_zoneId_idx" ON "Sensor"("zoneId");

-- CreateIndex
CREATE INDEX "Sensor_status_idx" ON "Sensor"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Sensor_zoneId_type_key" ON "Sensor"("zoneId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SensorReading_readingId_key" ON "SensorReading"("readingId");

-- CreateIndex
CREATE INDEX "SensorReading_zoneId_capturedAt_idx" ON "SensorReading"("zoneId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "SensorReading_zoneId_receivedAt_idx" ON "SensorReading"("zoneId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "SensorReading_capturedAt_idx" ON "SensorReading"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SensorReading_zoneId_sequenceNumber_key" ON "SensorReading"("zoneId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "ZoneStateTransition_zoneId_createdAt_idx" ON "ZoneStateTransition"("zoneId", "createdAt");

-- CreateIndex
CREATE INDEX "ZoneStateTransition_createdAt_idx" ON "ZoneStateTransition"("createdAt");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_zoneId_startedAt_idx" ON "Incident"("zoneId", "startedAt");

-- CreateIndex
CREATE INDEX "Incident_status_zoneId_idx" ON "Incident"("status", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Acknowledgment_incidentId_key" ON "Acknowledgment"("incidentId");

-- CreateIndex
CREATE INDEX "Acknowledgment_userId_idx" ON "Acknowledgment"("userId");

-- CreateIndex
CREATE INDEX "IncidentTimelineEvent_incidentId_createdAt_idx" ON "IncidentTimelineEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "ActuationCommand_zoneId_requestedAt_idx" ON "ActuationCommand"("zoneId", "requestedAt");

-- CreateIndex
CREATE INDEX "ActuationCommand_status_idx" ON "ActuationCommand"("status");

-- CreateIndex
CREATE INDEX "ActuationCommand_zoneId_status_idx" ON "ActuationCommand"("zoneId", "status");

-- CreateIndex
CREATE INDEX "ManualOverride_zoneId_createdAt_idx" ON "ManualOverride"("zoneId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualOverride_userId_createdAt_idx" ON "ManualOverride"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_type_severity_idx" ON "SystemEvent"("type", "severity");

-- CreateIndex
CREATE INDEX "SystemEvent_zoneId_createdAt_idx" ON "SystemEvent"("zoneId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentReport_status_createdAt_idx" ON "IncidentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentReport_zoneId_status_idx" ON "IncidentReport"("zoneId", "status");

-- CreateIndex
CREATE INDEX "ReadingHourlyAggregate_hour_idx" ON "ReadingHourlyAggregate"("hour");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingHourlyAggregate_zoneId_hour_key" ON "ReadingHourlyAggregate"("zoneId", "hour");

-- AddForeignKey
ALTER TABLE "ZoneCredential" ADD CONSTRAINT "ZoneCredential_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneStateTransition" ADD CONSTRAINT "ZoneStateTransition_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgment" ADD CONSTRAINT "Acknowledgment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgment" ADD CONSTRAINT "Acknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentTimelineEvent" ADD CONSTRAINT "IncidentTimelineEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActuationCommand" ADD CONSTRAINT "ActuationCommand_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActuationCommand" ADD CONSTRAINT "ActuationCommand_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverride" ADD CONSTRAINT "ManualOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
