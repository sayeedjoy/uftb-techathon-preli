import { Router } from "express"

import { requireAuthentication } from "../../middleware/authentication.middleware.js"
import { asyncHandler } from "../../shared/async-handler.js"
import { ok } from "../../shared/response.js"
import { getPriorityQueue } from "./priority-queue.service.js"

export const priorityRouter: Router = Router()

priorityRouter.use(requireAuthentication)

priorityRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    // Always an array — an empty queue is `[]`, never `null`.
    ok(res, { queue: await getPriorityQueue() })
  })
)
