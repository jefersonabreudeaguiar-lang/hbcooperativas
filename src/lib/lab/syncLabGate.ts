/**
 * Gate do laboratório sync/atualização — fail-closed em produção.
 * Dev local: habilitado automaticamente (npm run dev).
 * Produção: somente com HB_SYNC_LAB_ENABLED=true explícito.
 */

const SERVER_FLAG = "HB_SYNC_LAB_ENABLED";
const CLIENT_FLAG = "NEXT_PUBLIC_HB_SYNC_LAB_ENABLED";

const ALLOWED_ON = new Set(["true", "1"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

export function isSyncLabEnabledServer(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return parseFlag(process.env[SERVER_FLAG]);
}

export function isSyncLabEnabledClient(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return parseFlag(process.env[CLIENT_FLAG]);
}

export const SYNC_LAB_PATH = "/lab/sync";
