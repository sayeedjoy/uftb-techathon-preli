import { ERROR_CODE, type ApiErrorDetail, type ErrorCode } from "@scsrg/shared"

/**
 * Every deliberate failure in the system is an `AppError`. It carries the HTTP
 * status and the machine-readable `ErrorCode` the API contract promises, so
 * `error.middleware.ts` can shape a response without guessing.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly details?: ApiErrorDetail[]
  /** Set false for expected outcomes (a 409 race loser is not a bug). */
  readonly isOperational: boolean

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: ApiErrorDetail[],
    isOperational = true
  ) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.isOperational = isOperational
    Error.captureStackTrace?.(this, new.target)
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "The request payload is invalid.",
    details?: ApiErrorDetail[]
  ) {
    super(400, ERROR_CODE.VALIDATION_ERROR, message, details)
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(401, ERROR_CODE.UNAUTHENTICATED, message)
  }
}

export class InvalidCredentialsError extends AppError {
  /** Deliberately identical for unknown email and wrong password. */
  constructor(message = "Invalid email or password.") {
    super(401, ERROR_CODE.INVALID_CREDENTIALS, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(403, ERROR_CODE.FORBIDDEN, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super(404, ERROR_CODE.NOT_FOUND, message)
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "The request conflicts with the current state.",
    code: ErrorCode = ERROR_CODE.CONFLICT
  ) {
    super(409, code, message)
  }
}

export class DuplicateReadingError extends AppError {
  constructor(message = "This reading has already been recorded.") {
    super(409, ERROR_CODE.DUPLICATE_READING, message)
  }
}

export class AlreadyAcknowledgedError extends AppError {
  constructor(message = "This incident has already been acknowledged.") {
    super(409, ERROR_CODE.ALREADY_ACKNOWLEDGED, message)
  }
}

/** 422: the shape is right but the values are impossible. */
export class UnprocessableReadingError extends AppError {
  constructor(code: ErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(422, code, message, details)
  }
}

export class InvalidZoneKeyError extends AppError {
  constructor(message = "Invalid or revoked zone API key.") {
    super(401, ERROR_CODE.INVALID_ZONE_KEY, message)
  }
}

export class ZoneInactiveError extends AppError {
  constructor(message = "This zone is not active.") {
    super(403, ERROR_CODE.ZONE_INACTIVE, message)
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Slow down and try again.") {
    super(429, ERROR_CODE.RATE_LIMITED, message)
  }
}

export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred.") {
    super(500, ERROR_CODE.INTERNAL_ERROR, message, undefined, false)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
