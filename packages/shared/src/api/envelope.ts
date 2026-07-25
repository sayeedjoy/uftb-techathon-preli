/**
 * The single response envelope every SCS-RG endpoint uses.
 * Defined here so the frontend's fetch wrapper and the backend's response
 * helpers cannot drift apart.
 */

export const ERROR_CODE = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_READING: "DUPLICATE_READING",
  ALREADY_ACKNOWLEDGED: "ALREADY_ACKNOWLEDGED",
  VALUE_OUT_OF_RANGE: "VALUE_OUT_OF_RANGE",
  SENSOR_NOT_CONFIGURED: "SENSOR_NOT_CONFIGURED",
  INVALID_TIMESTAMP: "INVALID_TIMESTAMP",
  ZONE_INACTIVE: "ZONE_INACTIVE",
  INVALID_ZONE_KEY: "INVALID_ZONE_KEY",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/** One field-level problem inside a `VALIDATION_ERROR` response. */
export type ApiErrorDetail = {
  path: string
  message: string
  code?: string
}

export type ApiErrorBody = {
  code: ErrorCode
  message: string
  details?: ApiErrorDetail[]
}

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
}

export type ApiMeta = Record<string, unknown> & Partial<PaginationMeta>

export type ApiSuccessResponse<T> = {
  success: true
  data: T
  meta?: ApiMeta
}

export type ApiErrorResponse = {
  success: false
  error: ApiErrorBody
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export function isApiSuccess<T>(
  response: ApiResponse<T>
): response is ApiSuccessResponse<T> {
  return response.success === true
}

/** Default page size used by every paginated endpoint. */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200
