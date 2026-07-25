import type { NextFunction, Request, Response } from "express"
import { ZodError } from "zod"
import {
  ERROR_CODE,
  type ApiErrorBody,
  type ApiErrorDetail,
} from "@scsrg/shared"

import { logger } from "../config/logger.js"
import { isProduction } from "../config/env.js"
import { AppError, NotFoundError, isAppError } from "../shared/errors.js"
import { fail } from "../shared/response.js"

export function zodIssuesToDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
    code: issue.code,
  }))
}

/** Prisma surfaces failures as `{ code: "P2002", meta }` — map the ones we rely on. */
function fromPrismaError(error: {
  code: string
  meta?: Record<string, unknown>
}): AppError | null {
  switch (error.code) {
    case "P2002":
      return new AppError(
        409,
        ERROR_CODE.CONFLICT,
        "A record with these unique values already exists."
      )
    case "P2003":
      return new AppError(
        409,
        ERROR_CODE.CONFLICT,
        "This record is still referenced by other records and cannot be removed."
      )
    case "P2025":
      return new NotFoundError()
    default:
      return null
  }
}

function hasPrismaCode(
  error: unknown
): error is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code)
  )
}

export function notFoundHandler(req: Request, res: Response): Response {
  return fail(res, 404, {
    code: ERROR_CODE.NOT_FOUND,
    message: `No route matches ${req.method} ${req.path}.`,
  })
}

/**
 * The single place an error becomes an HTTP response. Nothing else in the
 * codebase writes an error body, so the envelope cannot drift.
 */
export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  let appError: AppError

  if (isAppError(error)) {
    appError = error
  } else if (error instanceof ZodError) {
    appError = new AppError(
      400,
      ERROR_CODE.VALIDATION_ERROR,
      "The request payload is invalid.",
      zodIssuesToDetails(error)
    )
  } else if (hasPrismaCode(error)) {
    appError =
      fromPrismaError(error) ??
      new AppError(
        500,
        ERROR_CODE.INTERNAL_ERROR,
        "A database error occurred.",
        undefined,
        false
      )
  } else if (
    error instanceof SyntaxError &&
    "body" in error &&
    "status" in error
  ) {
    // express.json() rejected the body before any route ran.
    const status = Number((error as { status: unknown }).status)
    appError =
      status === 413
        ? new AppError(
            413,
            ERROR_CODE.PAYLOAD_TOO_LARGE,
            "Request body exceeds the configured size limit."
          )
        : new AppError(
            400,
            ERROR_CODE.VALIDATION_ERROR,
            "Request body is not valid JSON."
          )
  } else if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type: unknown }).type === "entity.too.large"
  ) {
    appError = new AppError(
      413,
      ERROR_CODE.PAYLOAD_TOO_LARGE,
      "Request body exceeds the configured size limit."
    )
  } else {
    appError = new AppError(
      500,
      ERROR_CODE.INTERNAL_ERROR,
      "An unexpected error occurred.",
      undefined,
      false
    )
  }

  const logPayload = {
    err: error,
    method: req.method,
    path: req.originalUrl,
    statusCode: appError.statusCode,
    code: appError.code,
    requestId: res.getHeader("x-request-id"),
  }

  if (appError.statusCode >= 500 || !appError.isOperational) {
    logger.error(logPayload, appError.message)
  } else {
    logger.debug(logPayload, appError.message)
  }

  const body: ApiErrorBody = {
    code: appError.code,
    message: appError.message,
    ...(appError.details ? { details: appError.details } : {}),
  }

  // Stack traces never leave the process in production.
  if (!isProduction && appError.statusCode >= 500 && error instanceof Error) {
    body.details = [
      ...(body.details ?? []),
      { path: "stack", message: error.stack?.split("\n")[0] ?? error.message },
    ]
  }

  return fail(res, appError.statusCode, body)
}
