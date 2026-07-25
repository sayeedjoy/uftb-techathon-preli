import * as React from "react"
import { useLocation, useNavigate } from "react-router"
import { RotateCcw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

type Props = {
  children: React.ReactNode
  /** Changing this value clears a caught error — used to reset on navigation. */
  resetKey: string
  onReset: () => void
}

type State = { error: Error | null }

/**
 * Without a boundary, a single render-time throw unmounts the whole React tree
 * and the operator is left looking at a blank page with no route, no
 * navigation and no indication that anything failed. For a safety dashboard
 * that is the worst possible failure mode: it is indistinguishable from a calm,
 * empty screen.
 */
class ErrorBoundaryInner extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(previous: Props) {
    // A new route is a new chance to render successfully.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept as console output rather than a toast: this fires while the tree is
    // already broken, and the stack is what a developer needs.
    console.error("Unhandled render error", error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <TriangleAlert aria-hidden className="size-10 text-critical" />
        <div>
          <h1 className="text-lg font-semibold">This page failed to render</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            The dashboard caught the error instead of going blank. Live data is
            unaffected — the backend remains the source of truth.
          </p>
        </div>

        <pre className="max-w-full overflow-x-auto rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-left font-mono text-xs text-muted-foreground">
          {error.message}
        </pre>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={this.props.onReset}>
            <RotateCcw aria-hidden className="size-4" />
            Back to the Command Center
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}

/** Resets itself whenever the route changes, so an error is never sticky. */
export function RouteErrorBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <ErrorBoundaryInner
      resetKey={location.key}
      onReset={() => navigate("/", { replace: true })}
    >
      {children}
    </ErrorBoundaryInner>
  )
}
