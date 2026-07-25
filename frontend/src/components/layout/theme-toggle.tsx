import * as React from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(COLOR_SCHEME_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches
}

/**
 * The theme is an external system (a media query plus a class on `<html>`), so
 * it is read with `useSyncExternalStore` rather than mirrored into state by an
 * effect — the toggle then shows the *resolved* icon even while the stored
 * preference is "system".
 */
function useResolvedTheme(): "dark" | "light" {
  const { theme } = useTheme()
  const systemPrefersDark = React.useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemPrefersDark,
    () => true
  )

  if (theme === "system") return systemPrefersDark ? "dark" : "light"
  return theme
}

/**
 * The `d` hotkey already toggled the theme, but an undiscoverable shortcut is
 * not an affordance. This is the same action with a target you can see.
 */
export function ThemeToggle() {
  const { setTheme } = useTheme()
  const resolved = useResolvedTheme()
  const next = resolved === "dark" ? "light" : "dark"

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme (d)`}
      aria-label={`Switch to ${next} theme`}
    >
      {resolved === "dark" ? (
        <Sun aria-hidden className="size-4" />
      ) : (
        <Moon aria-hidden className="size-4" />
      )}
    </Button>
  )
}
