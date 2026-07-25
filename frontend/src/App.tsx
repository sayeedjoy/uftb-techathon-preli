import { BrowserRouter } from "react-router"

import { Providers } from "@/app/providers"
import { RouteErrorBoundary } from "@/app/error-boundary"
import { AppRoutes } from "@/routes"

export function App() {
  return (
    <BrowserRouter>
      <Providers>
        {/* Inside the router and the providers, so the fallback can navigate
            and a crash in one page never takes down the session or socket. */}
        <RouteErrorBoundary>
          <AppRoutes />
        </RouteErrorBoundary>
      </Providers>
    </BrowserRouter>
  )
}

export default App
