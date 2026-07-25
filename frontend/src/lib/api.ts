import type {
  ApiErrorDetail,
  ApiMeta,
  ApiResponse,
  ErrorCode,
} from "@scsrg/shared"

import { clearSession, getStoredToken } from "./auth-storage.ts"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1"

/** A failed request, carrying everything the UI needs to react precisely. */
export class ApiError extends Error {
  readonly code: ErrorCode | "NETWORK_ERROR"
  readonly status: number
  readonly details: ApiErrorDetail[]

  constructor(
    status: number,
    code: ErrorCode | "NETWORK_ERROR",
    message: string,
    details: ApiErrorDetail[] = []
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }

  /** A 409 is an expected outcome for acknowledge, not a failure to shout about. */
  get isConflict(): boolean {
    return this.status === 409
  }

  get isForbidden(): boolean {
    return this.status === 403
  }
}

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null
let redirecting = false

/** Registered once by the auth provider; guarantees a single redirect. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

function handleUnauthorized(): void {
  if (redirecting) return
  redirecting = true

  clearSession()
  onUnauthorized?.()

  // Released on the next tick so a burst of parallel 401s collapses into one
  // redirect rather than a loop.
  setTimeout(() => {
    redirecting = false
  }, 0)
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

export type ApiResult<T> = { data: T; meta?: ApiMeta }

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const serialised = params.toString()
  return serialised ? `${url}?${serialised}` : url
}

/**
 * The single fetch wrapper.
 *
 * It unwraps `{ success, data, meta }` so callers never touch the envelope, and
 * throws a typed `ApiError` on failure so React Query's error path carries the
 * machine-readable code rather than a string.
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const token = getStoredToken()

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  } catch (error) {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      error instanceof Error
        ? `Could not reach the server: ${error.message}`
        : "Could not reach the server."
    )
  }

  let payload: ApiResponse<T> | null
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    payload = null
  }

  if (!response.ok || !payload || payload.success === false) {
    if (response.status === 401) handleUnauthorized()

    const error = payload && payload.success === false ? payload.error : null
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed with status ${response.status}.`,
      error?.details ?? []
    )
  }

  return { data: payload.data, ...(payload.meta ? { meta: payload.meta } : {}) }
}

/** Convenience wrapper for the common "I only want the data" case. */
export async function apiGet<T>(
  path: string,
  query?: RequestOptions["query"]
): Promise<T> {
  return (await request<T>(path, query ? { query } : {})).data
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return (await request<T>(path, { method: "POST", ...(body ? { body } : {}) }))
    .data
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return (await request<T>(path, { method: "PATCH", ...(body ? { body } : {}) }))
    .data
}
