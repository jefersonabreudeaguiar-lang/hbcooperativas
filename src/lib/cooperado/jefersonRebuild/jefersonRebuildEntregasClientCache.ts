import type { JefersonRebuildEntregasPayload } from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildEntregas";

const KEY = "hb.coop.jefersonRebuild.entregas.v1";

export function readJefersonRebuildEntregasClientCache(): JefersonRebuildEntregasPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JefersonRebuildEntregasPayload;
    return parsed?.snapshot?.entregasBase ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJefersonRebuildEntregasClientCache(payload: JefersonRebuildEntregasPayload): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
