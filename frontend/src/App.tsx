import { BrowserRouter } from "react-router"

import { Providers } from "@/app/providers"
import { AppRoutes } from "@/routes"

export function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRoutes />
      </Providers>
    </BrowserRouter>
  )
}

export default App
