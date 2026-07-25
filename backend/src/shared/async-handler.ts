import type { NextFunction, Request, RequestHandler, Response } from "express"

/**
 * Express 5 forwards rejected promises on its own, but wrapping keeps the
 * intent explicit and satisfies `no-floating-promises` at every call site.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}
