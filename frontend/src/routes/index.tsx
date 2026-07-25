import { Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/layout/app-shell"
import { LoginPage } from "@/features/auth/login-page"
import { CommandCenterPage } from "@/features/dashboard/command-center-page"
import { IncidentHistoryPage } from "@/features/incidents/incident-history-page"
import { ZoneDetailPage } from "@/features/zones/zone-detail-page"
import { ZoneListPage } from "@/features/zones/zone-list-page"
import { SystemHealthPage } from "@/features/system-health/system-health-page"
import { AdministrationPage } from "@/features/administration/administration-page"
import { AuditLogPage } from "@/features/audit/audit-log-page"
import { SimulatorPage } from "@/features/simulator/simulator-page"
import { ReportsPage } from "@/features/reports/reports-page"
import { ProfilePage } from "@/features/profile/profile-page"
import { RequireAuth, RequireRole } from "./guards"

/**
 * The route table.
 *
 * Admin-only destinations are wrapped in `RequireRole`, not merely hidden from
 * the sidebar: deep-linking to `/system-health` as security staff must be
 * refused, and the backend refuses the underlying calls regardless.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<CommandCenterPage />} />
        <Route path="incidents" element={<IncidentHistoryPage />} />
        <Route path="zones" element={<ZoneListPage />} />
        <Route path="zones/:zoneId" element={<ZoneDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />

        <Route
          path="system-health"
          element={
            <RequireRole role="ADMIN">
              <SystemHealthPage />
            </RequireRole>
          }
        />
        <Route
          path="admin"
          element={
            <RequireRole role="ADMIN">
              <AdministrationPage />
            </RequireRole>
          }
        />
        <Route
          path="audit-logs"
          element={
            <RequireRole role="ADMIN">
              <AuditLogPage />
            </RequireRole>
          }
        />
        <Route
          path="simulator"
          element={
            <RequireRole role="ADMIN">
              <SimulatorPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
