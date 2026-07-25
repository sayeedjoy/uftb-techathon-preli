import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/features/auth/auth-provider"
import { SocketProvider } from "@/hooks/use-socket"
import { queryClient } from "@/lib/query-client"

/**
 * The provider tree, composed in dependency order:
 * server cache → session → live transport → toasts.
 *
 * The pre-existing `ThemeProvider` stays where it was, in `main.tsx`, so this
 * file adds to the setup rather than reshaping it.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          {children}
          <Toaster
            position="top-right"
            expand
            closeButton
            richColors
            // Stacked and independently dismissible: simultaneous critical
            // alerts must never overwrite one another.
            visibleToasts={6}
          />
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
