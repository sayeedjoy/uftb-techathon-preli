import type { Response } from "express"
import type {
  ApiErrorBody,
  ApiMeta,
  ApiSuccessResponse,
  PaginationMeta,
} from "@scsrg/shared"

/** Wraps a payload in the `{ success, data, meta }` envelope. */
export function ok<T>(res: Response, data: T, meta?: ApiMeta): Response {
  const body: ApiSuccessResponse<T> = meta
    ? { success: true, data, meta }
    : { success: true, data }
  return res.status(200).json(body)
}

export function created<T>(res: Response, data: T, meta?: ApiMeta): Response {
  const body: ApiSuccessResponse<T> = meta
    ? { success: true, data, meta }
    : { success: true, data }
  return res.status(201).json(body)
}

export function fail(
  res: Response,
  statusCode: number,
  error: ApiErrorBody
): Response {
  return res.status(statusCode).json({ success: false, error })
}

export function paginationMeta(
  page: number,
  pageSize: number,
  total: number
): PaginationMeta {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
  }
}
