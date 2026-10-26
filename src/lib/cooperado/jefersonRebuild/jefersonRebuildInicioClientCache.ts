import type { JefersonRebuildInicioCardPayload } from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildInicioCard";

const KEY = "hb.coop.jefersonRebuild.inicio.v1";

export function readJefersonRebuildInicioClientCache(): JefersonRebuildInicioCardPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JefersonRebuildInicioCardPayload;
    return parsed?.card ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJefersonRebuildInicioClientCache(payload: JefersonRebuildInicioCardPayload): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
