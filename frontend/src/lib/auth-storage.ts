import type { AuthUserDto } from "@scsrg/shared"

/**
 * Token storage.
 *
 * `localStorage` keeps the demo simple and survives a reload, at the cost of
 * XSS exposure. Production would move the token to an httpOnly cookie with
 * refresh rotation, which is a backend change as much as a frontend one.
 */
const TOKEN_KEY = "scsrg.token"
const USER_KEY = "scsrg.user"

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function storeSession(token: string, user: AuthUserDto): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // A private-mode browser without storage still works for the session.
  }
}

export function getStoredUser(): AuthUserDto | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUserDto) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
  } catch {
    // Nothing to clear.
  }
}
