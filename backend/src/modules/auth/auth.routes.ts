import { Router } from "express"

import { authRateLimit } from "../../middleware/rate-limit.middleware.js"
import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { loginController, meController } from "./auth.controller.js"

export const authRouter: Router = Router()

// Login is the one unauthenticated write endpoint, so it carries the tightest
// rate limit in the system (5/min/IP).
authRouter.post("/login", authRateLimit, asyncHandler(loginController))
authRouter.get("/me", requireAuthentication, asyncHandler(meController))
