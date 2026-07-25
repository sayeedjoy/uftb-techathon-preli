import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Navigate, useLocation, useNavigate } from "react-router"
import { AlertTriangle, Loader2, Siren } from "lucide-react"
import { loginSchema, type LoginInput } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { useAuth } from "./auth-provider"

export function LoginPage() {
  const { login, isAuthenticated, isRestoring } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    // The identical schema the endpoint validates against.
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  if (!isRestoring && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await login(values)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== "/login" ? from : "/", { replace: true })
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : "Sign-in failed. Please try again."
      )
    }
  })

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Siren aria-hidden className="size-7 text-red-500" />
          <div>
            <h1 className="text-lg leading-tight font-semibold">SCS-RG</h1>
            <p className="text-sm text-muted-foreground">
              Multi-Hazard Campus Safety &amp; Response Grid
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="email-error" role="alert" className="text-xs text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="text-xs text-red-400"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {serverError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting && (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            )}
            Sign in
          </Button>
        </form>

        <div className="mt-8 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            Development-only credentials
          </p>
          <p className="font-mono">admin@scsrg.local / Admin123!</p>
          <p className="font-mono">security@scsrg.local / Security123!</p>
          <p className="mt-2">
            Seeded for local demonstration. Never use these in production.
          </p>
        </div>
      </div>
    </div>
  )
}
