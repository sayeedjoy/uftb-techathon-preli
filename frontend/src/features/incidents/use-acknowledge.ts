import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AcknowledgmentDto } from "@scsrg/shared"

import { ApiError, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

/**
 * Acknowledge mutation.
 *
 * A `409` is an *expected* outcome — someone else got there first — so it is
 * reported as information, not as an error. The backend's conditional update is
 * the mechanism that decides the winner; this is only how we tell the operator.
 */
export function useAcknowledgeIncident() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ incidentId, note }: { incidentId: string; note?: string }) =>
      apiPost<{ acknowledgment: AcknowledgmentDto }>(
        `/incidents/${incidentId}/acknowledge`,
        note ? { note } : {}
      ),

    onSuccess: (result) => {
      toast.success("Incident acknowledged", {
        description: `Recorded against ${result.acknowledgment.userName}.`,
      })
    },

    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        toast.info("Already acknowledged", {
          description:
            "Another officer acknowledged this incident first. Refreshing the queue.",
        })
        return
      }
      toast.error("Could not acknowledge", {
        description:
          error instanceof ApiError ? error.message : "Please try again.",
      })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.incidents.all(),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.priorityQueue.all(),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.summary(),
      })
    },
  })
}
