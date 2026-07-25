import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Navigate, useLocation, useNavigate } from "react-router"
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Radio,
  ShieldCheck,
  Siren,
  UserCog,
} from "lucide-react"
import { loginSchema, type LoginInput } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api"
import { useAuth } from "./auth-provider"

/**
 * The seeded local accounts, offered as one-click sign-in.
 *
 * These exist only because `prisma/seed.ts` creates them for local
 * demonstration. Gating on `import.meta.env.DEV` keeps the shortcut out of a
 * production bundle entirely — a build served anywhere real ships no
 * credentials at all, rather than merely hiding them behind a heading.
 */
const DEMO_ACCOUNTS = [
  {
    role: "Administrator",
    Icon: UserCog,
    email: "admin@scsrg.local",
    password: "Admin123!",
    grants: "Full access, including Simulator and Administration",
  },
  {
    role: "Security staff",
    Icon: ShieldCheck,
    email: "security@scsrg.local",
    password: "Security123!",
    grants: "Monitoring and acknowledgment; admin pages are refused",
  },
] as const

export function LoginPage() {
  const { login, isAuthenticated, isRestoring } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [fillingRole, setFillingRole] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    // The identical schema the endpoint validates against.
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const completeSignIn = React.useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== "/login" ? from : "/", { replace: true })
  }, [location.state, navigate])

  const describeFailure = (error: unknown) =>
    error instanceof ApiError
      ? error.message
      : "Sign-in failed. Please try again."

  if (!isRestoring && isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await login(values)
      completeSignIn()
    } catch (error) {
      setServerError(describeFailure(error))
    }
  })

  /**
   * Fills the visible fields *and* submits.
   *
   * The fields are populated before the request rather than bypassed, so the
   * form still shows what was sent — a shortcut that hides its own input turns
   * a failed demo login into a guessing game.
   */
  const signInAs = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setServerError(null)
    setValue("email", account.email, { shouldValidate: true })
    setValue("password", account.password, { shouldValidate: true })
    setFillingRole(account.role)

    try {
      await login({ email: account.email, password: account.password })
      completeSignIn()
    } catch (error) {
      setServerError(describeFailure(error))
    } finally {
      setFillingRole(null)
    }
  }

  const busy = isSubmitting || fillingRole !== null

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_minmax(28rem,1fr)]">
      {/* Context panel. Hidden on small screens, where the form is the only
          thing worth the viewport. */}
      <aside className="relative hidden flex-col justify-between border-r border-border/60 bg-muted/30 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <Siren aria-hidden className="size-6 text-critical" />
          <div>
            <p className="text-sm leading-tight font-semibold">SCS-RG</p>
            <p className="text-xs text-muted-foreground">
              Multi-Hazard Campus Safety &amp; Response Grid
            </p>
          </div>
        </div>

        <div className="max-w-md">
          <h2 className="text-2xl leading-snug font-semibold tracking-tight text-balance">
            Every computed value on this screen was produced by the backend.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Sensor nodes submit raw readings and nothing else. Risk fusion,
            state classification, incident lifecycle, response ranking and
            actuation are decided server-side, from data the server validated
            itself.
          </p>

          <dl className="mt-8 flex flex-col gap-4 border-t border-border/60 pt-6">
            {[
              [
                "Live by default",
                "Socket events patch the cache; every reconnect refetches the truth.",
              ],
              [
                "Offline means unknown",
                "A silent zone keeps its incident open. It is never shown as safe.",
              ],
              [
                "Ranked, with reasons",
                "The priority queue explains why rank 1 outranks rank 2.",
              ],
            ].map(([term, detail]) => (
              <div key={term} className="flex gap-3">
                <Radio
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div>
                  <dt className="text-sm font-medium">{term}</dt>
                  <dd className="text-sm text-muted-foreground">{detail}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-muted-foreground">
          Security command dashboard · authorised personnel only
        </p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Siren aria-hidden className="size-7 text-critical" />
            <div>
              <h1 className="text-lg leading-tight font-semibold">SCS-RG</h1>
              <p className="text-sm text-muted-foreground">
                Multi-Hazard Campus Safety &amp; Response Grid
              </p>
            </div>
          </div>

          <div className="mb-6 hidden lg:block">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your operator credentials to reach the command dashboard.
            </p>
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
                <p
                  id="email-error"
                  role="alert"
                  className="text-xs text-critical"
                >
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  // The control reports state rather than intent, so a screen
                  // reader announces whether the password is currently exposed.
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden className="size-4" />
                  ) : (
                    <Eye aria-hidden className="size-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-xs text-critical"
                >
                  {errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-surface px-3 py-2 text-sm text-critical"
              >
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                {serverError}
              </p>
            )}

            <Button type="submit" disabled={busy} className="mt-2">
              {isSubmitting && (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              )}
              Sign in
            </Button>
          </form>

          {import.meta.env.DEV && (
            <section
              aria-labelledby="demo-credentials-heading"
              className="mt-8 rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              <p
                id="demo-credentials-heading"
                className="text-xs font-medium text-foreground"
              >
                Development-only credentials
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One click fills the form and signs in — no copying required.
              </p>

              <ul className="mt-3 flex flex-col gap-2">
                {DEMO_ACCOUNTS.map((account) => {
                  const isFilling = fillingRole === account.role
                  return (
                    <li key={account.email}>
                      <button
                        type="button"
                        onClick={() => void signInAs(account)}
                        disabled={busy}
                        aria-label={`Sign in as ${account.role.toLowerCase()} using the seeded ${account.email} account`}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-left transition-colors",
                          "hover:border-border hover:bg-accent",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          "disabled:pointer-events-none disabled:opacity-60"
                        )}
                      >
                        <account.Icon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {account.role}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {account.email}
                          </span>
                        </span>
                        {isFilling ? (
                          <Loader2
                            aria-hidden
                            className="size-4 shrink-0 animate-spin text-muted-foreground"
                          />
                        ) : (
                          <ArrowRight
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          />
                        )}
                      </button>
                      <p className="mt-1 pl-10 text-[11px] text-muted-foreground">
                        {account.grants}
                      </p>
                    </li>
                  )
                })}
              </ul>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Seeded for local demonstration. Never use these in production.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
