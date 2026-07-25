import { Router } from "express"

import { adminRouter } from "../modules/admin/admin.routes.js"
import { advisoryRouter } from "../modules/advisory/advisory.routes.js"
import { authRouter } from "../modules/auth/auth.routes.js"
import { dashboardRouter } from "../modules/dashboard/dashboard.routes.js"
import { incidentsRouter } from "../modules/incidents/incidents.routes.js"
import { ingestionRouter } from "../modules/ingestion/ingestion.routes.js"
import { priorityRouter } from "../modules/priority-engine/priority.routes.js"
import { reportsRouter } from "../modules/reports/reports.routes.js"
import { simulatorRouter } from "../modules/simulator/simulator.routes.js"
import { zonesRouter } from "../modules/zones/zones.routes.js"

/** Single mount point for everything under `/api/v1`. */
export const apiRouter: Router = Router()

apiRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    data: { name: "SCS-RG API", version: "v1", docs: "/api/v1/docs" },
  })
})

apiRouter.use("/auth", authRouter)
apiRouter.use("/zones", zonesRouter)
apiRouter.use("/ingestion", ingestionRouter)
apiRouter.use("/incidents", incidentsRouter)
apiRouter.use("/priority-queue", priorityRouter)
apiRouter.use("/dashboard", dashboardRouter)
apiRouter.use("/admin", adminRouter)
apiRouter.use("/simulator", simulatorRouter)
apiRouter.use("/reports", reportsRouter)
// Bonus 1 & 2 — advisory only, never part of a hazard decision.
apiRouter.use("/", advisoryRouter)
