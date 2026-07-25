import { QueryClient } from "@tanstack/react-query"

import { ApiError } from "./api.ts"

/**
 * Sockets keep this cache fresh, so background refetching is deliberately quiet:
 * polling as the primary update path would both hide a broken socket and put
 * needless load on the backend during the 30-zone scenario.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry(failureCount, error) {
          // Retrying an auth or permission failure just delays the redirect.
          if (error instanceof ApiError) {
            if ([400, 401, 403, 404, 409, 422].includes(error.status)) {
              return false
            }
          }
          return failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })
}

export const queryClient = createQueryClient()
