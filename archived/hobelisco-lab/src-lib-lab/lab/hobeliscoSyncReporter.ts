/** Stub — telemetria Hobelisco opcional (fail-silent). */

export type HobeliscoSyncEvent = {
  eventType: string;
  cooperativeId?: string | null;
  outcome?: string;
  durationMs?: number;
  detail?: string;
};

export function reportHobeliscoSyncEvent(_event: HobeliscoSyncEvent): void {
  /* no-op */
}
