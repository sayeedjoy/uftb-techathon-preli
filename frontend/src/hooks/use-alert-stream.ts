import { toast } from "sonner"

import { useSocketEvent } from "./use-socket"

const SOUND_ENABLED =
  String(import.meta.env.VITE_ALERT_SOUND_ENABLED ?? "false") === "true"

/**
 * A short attention tone, synthesised so the repository carries no audio asset.
 * Off by default so a demo room is not ambushed.
 */
function playAlertTone(): void {
  if (!SOUND_ENABLED) return
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtor) return

    const context = new AudioCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = "square"
    oscillator.frequency.value = 880
    gain.gain.value = 0.04

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
  } catch {
    // A blocked or unavailable audio context must never break the dashboard.
  }
}

/**
 * Raises operator-facing notifications from live events.
 *
 * Two rules carry the weight:
 *  · simultaneous alerts stack and stay independently dismissible — none is
 *    overwritten by the next; and
 *  · a reconnect replaying recent history raises no toast, because
 *    `useSocketEvent` reports `shouldNotify: false` for backdated events and
 *    drops repeated `eventId`s outright.
 */
export function useAlertStream(): void {
  useSocketEvent("incident:created", (payload, meta) => {
    if (!meta.shouldNotify) return

    playAlertTone()
    toast.error(`CRITICAL · ${payload.incident.zoneName}`, {
      // Keyed by incident so two zones produce two toasts, not one replacing
      // the other.
      id: `incident-${payload.incident.id}`,
      duration: 15_000,
      description: `Risk ${payload.incident.currentRiskScore.toFixed(1)} · ${
        payload.incident.dominantHazards.join(", ").toLowerCase() ||
        "unclassified hazard"
      }`,
    })
  })

  useSocketEvent("incident:acknowledged", (payload, meta) => {
    // Stop the attention cue, but keep the incident visible until resolved.
    toast.dismiss(`incident-${payload.incident.id}`)
    if (!meta.shouldNotify) return

    toast.info(`Acknowledged · ${payload.incident.zoneName}`, {
      id: `ack-${payload.incident.id}`,
      description: payload.incident.acknowledgedByName
        ? `By ${payload.incident.acknowledgedByName}`
        : undefined,
    })
  })

  useSocketEvent("incident:resolved", (payload, meta) => {
    toast.dismiss(`incident-${payload.incident.id}`)
    if (!meta.shouldNotify) return

    toast.success(`Resolved · ${payload.incident.zoneName}`, {
      id: `resolved-${payload.incident.id}`,
      description: `Peak risk ${payload.incident.maximumRiskScore.toFixed(1)}`,
    })
  })

  useSocketEvent("sensor:offline", (payload, meta) => {
    if (!meta.shouldNotify) return

    toast.warning(`Offline · ${payload.zoneName}`, {
      id: `offline-${payload.zoneId}`,
      description:
        "This zone stopped reporting. It is not safe — it is unknown.",
    })
  })
}
