import * as React from "react"

const STORAGE_KEY = "scsrg.sidebar-collapsed"

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    // A blocked storage API must never stop the shell from rendering.
    return false
  }
}

/**
 * Sidebar collapse, persisted across reloads.
 *
 * An operator who works on a laptop and wants the width back for the zone grid
 * should not have to re-collapse it every session. Read lazily on mount and
 * written on change — no effect, so there is no expanded-then-collapsed flash.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = React.useState(readStored)

  const toggle = React.useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Preference is a nicety; failing to persist it is not an error.
      }
      return next
    })
  }, [])

  return [collapsed, toggle]
}
