/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AuthUserDto,
  LoginInput,
  LoginResponseDto,
  UserRole,
} from "@scsrg/shared"

import { apiGet, apiPost, setUnauthorizedHandler } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  storeSession,
} from "@/lib/auth-storage"

type AuthState = {
  user: AuthUserDto | null
  token: string | null
  isAuthenticated: boolean
  /** True until the stored session has been revalidated against the API. */
  isRestoring: boolean
  login: (input: LoginInput) => Promise<AuthUserDto>
  logout: () => void
  hasRole: (role: UserRole) => boolean
}

const AuthContext = React.createContext<AuthState | undefined>(undefined)

/**
 * Session state.
 *
 * The stored user is only a cache to avoid a flash of "signing in"; `/auth/me`
 * is the source of truth, fetched through React Query like every other piece of
 * server data. A revoked account or a changed role therefore takes effect on
 * the next revalidation rather than lingering in localStorage.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = React.useState<string | null>(() => getStoredToken())

  const logout = React.useCallback(() => {
    clearSession()
    setToken(null)
    queryClient.removeQueries({ queryKey: queryKeys.auth.me() })
  }, [queryClient])

  // A 401 raised anywhere in the app drops the session exactly once.
  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
    })
  }, [])

  const me = useQuery({
    queryKey: queryKeys.auth.me(),
    enabled: token !== null,
    staleTime: 60_000,
    retry: false,
    initialData: () => {
      const cached = getStoredUser()
      return cached ? { user: cached } : undefined
    },
    queryFn: async () => {
      try {
        const result = await apiGet<{ user: AuthUserDto }>("/auth/me")
        const current = getStoredToken()
        if (current) storeSession(current, result.user)
        return result
      } catch (error) {
        // Clearing here (rather than in an effect) keeps the session teardown
        // out of the render path entirely.
        logout()
        throw error
      }
    },
  })

  const login = React.useCallback(
    async (input: LoginInput) => {
      const result = await apiPost<LoginResponseDto>("/auth/login", input)
      storeSession(result.token, result.user)
      setToken(result.token)
      queryClient.setQueryData(queryKeys.auth.me(), { user: result.user })
      return result.user
    },
    [queryClient]
  )

  const user = token ? (me.data?.user ?? null) : null

  const value = React.useMemo<AuthState>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isRestoring: token !== null && me.isPending,
      login,
      logout,
      hasRole: (role: UserRole) => user?.role === role,
    }),
    [user, token, me.isPending, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider")
  }
  return context
}

/** Convenience predicate used to hide admin-only UI. Never the enforcement. */
export function useIsAdmin(): boolean {
  return useAuth().user?.role === "ADMIN"
}
