/**
 * Reporter client-side de eventos sync → Hobelisco V2 ingest
 * Fire-and-forget; falhas silenciosas não afetam sync do app
 */

import { secureApiFetch } from "@/lib/security/clientSession";

export type HobeliscoSyncEventType =
  | "sync_session_failure"
  | "sync_cnpj_missing"
  | "sync_ficha_pull_failure"
  | "sync_push_failure"
  | "sync_pull_failure"
  | "sync_bidirectional_failure"
  | "sync_background_failure"
  | "sync_success";

export function reportHobeliscoSyncEvent(input: {
  eventType: HobeliscoSyncEventType;
  cooperativeId?: string | null;
  outcome?: "success" | "failure" | "unknown";
  durationMs?: number;
}): void {
  if (typeof window === "undefined") return;

  void secureApiFetch("/api/lab/hobelisco/v2/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "sync",
      endpoint: "/sync/client",
      eventType: input.eventType,
      cooperativeId: input.cooperativeId ?? null,
      outcome: input.outcome ?? (input.eventType === "sync_success" ? "success" : "failure"),
      durationMs: input.durationMs,
    }),
  }).catch(() => {
    /* fail-silent */
  });
}
