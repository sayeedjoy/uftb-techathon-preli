import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { IncidentReportDto } from "@scsrg/shared"

import { ApiError, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

/**
 * The administrator's two verdicts on a pending report.
 *
 * Approval is the moment a report gains any influence at all — and even then
 * only a bounded bonus to response priority, which is why the queue is
 * invalidated alongside the list. Rejection changes nothing downstream.
 *
 * A `409` means another administrator got there first: an expected outcome, not
 * a failure. It is reported as information and the list is refetched so the row
 * shows the verdict that actually landed.
 */
export function useReportReview() {
  const queryClient = useQueryClient()

  const refreshList = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() })

  function onError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.isConflict) {
      toast.info("Already reviewed", { description: error.message })
      refreshList()
      return
    }
    toast.error(error instanceof ApiError ? error.message : fallback)
  }

  const approve = useMutation({
    mutationFn: (reportId: string) =>
      apiPost<{ report: IncidentReportDto }>(
        `/reports/${reportId}/confirm`,
        {}
      ),
    onSuccess: () => {
      toast.success("Report approved", {
        description:
          "It may now contribute a bounded bonus to response priority.",
      })
      refreshList()
      void queryClient.invalidateQueries({
        queryKey: queryKeys.priorityQueue.all(),
      })
    },
    onError: (error) => onError(error, "Could not approve the report."),
  })

  const reject = useMutation({
    mutationFn: (reportId: string) =>
      apiPost<{ report: IncidentReportDto }>(`/reports/${reportId}/reject`, {}),
    onSuccess: () => {
      toast.success("Report rejected", {
        description: "It stays on record and influences nothing.",
      })
      refreshList()
    },
    onError: (error) => onError(error, "Could not reject the report."),
  })

  return { approve, reject }
}
