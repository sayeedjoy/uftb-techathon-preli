import { z } from "zod"

import { USER_ROLES } from "../domain/index.js"

/**
 * Shared by the login form (React Hook Form resolver) and the endpoint, so the
 * client and the server can never disagree about what a valid login looks like.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(255)
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(USER_ROLES),
  createdAt: z.string(),
})
export type AuthUser = z.infer<typeof authUserSchema>

export const loginResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.string(),
  user: authUserSchema,
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

export const updateUserRoleSchema = z.object({
  role: z.enum(USER_ROLES),
})
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>
