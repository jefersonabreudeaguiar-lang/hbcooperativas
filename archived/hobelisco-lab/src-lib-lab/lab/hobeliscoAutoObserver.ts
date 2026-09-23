/** Stub de produção — observador Hobelisco desligado quando o pacote lab não está no deploy. */

export type HobeliscoIngestPayload = {
  type?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  cooperativeId?: string | null;
  outcome?: string;
  eventType?: string;
};

export function isAutoObserverEnabled(): boolean {
  return process.env.HB_HOBELISCO_AUTO_OBSERVER === "true";
}

export function shouldObservePath(_endpoint?: string): boolean {
  return false;
}

export async function ingestHobeliscoObservation(_payload: HobeliscoIngestPayload): Promise<void> {
  /* no-op */
}
