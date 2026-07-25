import {
  REPORT_STATUS,
  type IncidentReportDto,
  type NaturalLanguageReportInput,
} from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import { ConflictError, NotFoundError } from "../../shared/errors.js"
import { writeAuditLog } from "../audit/audit.service.js"
import { recalculatePriorityQueue } from "../priority-engine/priority-queue.service.js"
import { publishPriorityQueue } from "../../realtime/domain-events.js"
import { extractReport } from "./extractor.js"
import type { ZoneAlias } from "./extractor.deterministic.js"

type ReportRow = Awaited<
  ReturnType<typeof prisma.incidentReport.findFirstOrThrow>
> & {
  user: { name: string }
  zone: { code: string } | null
}

function toDto(report: ReportRow): IncidentReportDto {
  return {
    id: report.id,
    userId: report.userId,
    userName: report.user.name,
    rawText: report.rawText,
    zoneId: report.zoneId,
    zoneCode: report.zone?.code ?? null,
    hazardType: report.hazardType,
    estimatedSeverity: report.estimatedSeverity,
    confidence: report.confidence,
    confirmationMessage: report.confirmationMessage,
    status: report.status,
    extractorProvider: report.extractorProvider,
    createdAt: report.createdAt.toISOString(),
    confirmedAt: report.confirmedAt?.toISOString() ?? null,
  }
}

async function zoneAliases(): Promise<ZoneAlias[]> {
  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    select: { code: true, name: true, location: true },
  })

  return zones.map((zone) => ({
    code: zone.code,
    name: zone.name,
    aliases: [
      zone.code.replace(/-/g, " "),
      ...(zone.location ? [zone.location] : []),
    ],
  }))
}

/**
 * Turns free text into a structured, PENDING report.
 *
 * Whichever extractor runs, the output passes `applyValidationGate` before it
 * is stored, and the stored record influences nothing until a human confirms it.
 */
export async function submitNaturalLanguageReport(
  input: NaturalLanguageReportInput,
  actor: { id: string; name: string },
  ipAddress: string | null
): Promise<IncidentReportDto> {
  const zones = await zoneAliases()

  const {
    result: extraction,
    provider,
    model,
  } = await extractReport(input.text, zones)

  const zone = extraction.zoneCode
    ? await prisma.zone.findUnique({ where: { code: extraction.zoneCode } })
    : null

  const report = await prisma.incidentReport.create({
    data: {
      userId: actor.id,
      zoneId: zone?.id ?? null,
      rawText: input.text,
      hazardType: extraction.hazardType,
      estimatedSeverity: extraction.estimatedSeverity,
      confidence: extraction.confidence,
      confirmationMessage: extraction.confirmationMessage,
      extractorProvider: provider,
      status: REPORT_STATUS.PENDING,
    },
    include: {
      user: { select: { name: true } },
      zone: { select: { code: true } },
    },
  })

  await writeAuditLog({
    userId: actor.id,
    action: "REPORT_SUBMITTED",
    entityType: "IncidentReport",
    entityId: report.id,
    metadata: {
      zoneCode: extraction.zoneCode,
      hazardType: extraction.hazardType,
      severity: extraction.estimatedSeverity,
      // Which extractor produced this is part of the audit trail, not a detail.
      extractorProvider: provider,
      extractorModel: model,
    },
    ipAddress,
  })

  return toDto(report as ReportRow)
}

export async function listReports(
  status?: "PENDING" | "CONFIRMED" | "REJECTED"
): Promise<IncidentReportDto[]> {
  const rows = await prisma.incidentReport.findMany({
    where: status ? { status } : {},
    include: {
      user: { select: { name: true } },
      zone: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return rows.map((row) => toDto(row as ReportRow))
}

/**
 * Confirms a report (ADMIN only).
 *
 * Only after this does the report contribute anything, and even then its
 * influence is capped at `PRIORITY_HUMAN_REPORT_BONUS_MAX` points of priority.
 * It still cannot create an incident or actuate.
 */
export async function confirmReport(
  reportId: string,
  actor: { id: string; name: string },
  note: string | undefined,
  ipAddress: string | null
): Promise<IncidentReportDto> {
  const existing = await prisma.incidentReport.findUnique({
    where: { id: reportId },
  })
  if (!existing) throw new NotFoundError("Report not found.")
  if (existing.status !== REPORT_STATUS.PENDING) {
    throw new ConflictError(
      `This report has already been ${existing.status.toLowerCase()}.`
    )
  }

  const updated = await prisma.incidentReport.update({
    where: { id: reportId },
    data: {
      status: REPORT_STATUS.CONFIRMED,
      confirmedAt: new Date(),
      confirmedBy: actor.id,
    },
    include: {
      user: { select: { name: true } },
      zone: { select: { code: true } },
    },
  })

  await writeAuditLog({
    userId: actor.id,
    action: "REPORT_CONFIRMED",
    entityType: "IncidentReport",
    entityId: reportId,
    metadata: { note: note ?? null },
    ipAddress,
  })

  // Re-rank so the bounded bonus takes effect immediately.
  await recalculatePriorityQueue()
  await publishPriorityQueue()

  return toDto(updated as ReportRow)
}

/**
 * Rejects a report (ADMIN only).
 *
 * Guarded the same way as confirmation: a verdict is only ever cast on a
 * `PENDING` report. Without this, a second administrator arriving late could
 * flip an already-approved report to `REJECTED` while its bounded priority
 * bonus stayed in the queue — a silent disagreement between the two.
 */
export async function rejectReport(
  reportId: string,
  actor: { id: string },
  ipAddress: string | null
): Promise<IncidentReportDto> {
  const existing = await prisma.incidentReport.findUnique({
    where: { id: reportId },
  })
  if (!existing) throw new NotFoundError("Report not found.")
  if (existing.status !== REPORT_STATUS.PENDING) {
    throw new ConflictError(
      `This report has already been ${existing.status.toLowerCase()}.`
    )
  }

  const updated = await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: REPORT_STATUS.REJECTED },
    include: {
      user: { select: { name: true } },
      zone: { select: { code: true } },
    },
  })

  await writeAuditLog({
    userId: actor.id,
    action: "REPORT_REJECTED",
    entityType: "IncidentReport",
    entityId: reportId,
    ipAddress,
  })

  return toDto(updated as ReportRow)
}
