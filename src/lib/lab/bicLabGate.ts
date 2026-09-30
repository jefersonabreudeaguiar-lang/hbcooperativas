/**
 * Gate BIC LAB — fail-closed no deploy oficial de produção.
 */

import { evaluateBicLabBoundary, isBicBoundaryClearForLabOperation } from "./bicLabBoundary";

const SERVER_FLAG = "HB_BIC_LAB_ENABLED";
const CLIENT_FLAG = "NEXT_PUBLIC_HB_BIC_LAB_ENABLED";

const ALLOWED_ON = new Set(["true", "1", "yes"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

export const BIC_LAB_PATH = "/lab/bic";

/** Operações estritas (preview LAB espelho) — exige fronteira limpa. */
export function isBicLabEnabledServer(env: NodeJS.ProcessEnv = process.env): boolean {
  const boundary = evaluateBicLabBoundary(env);
  if (boundary.productionLocked) return false;
  if (!isBicBoundaryClearForLabOperation(env)) return false;
  return parseFlag(env[SERVER_FLAG]);
}

/**
 * Painel /lab/bic no `npm run dev`: flag LAB + não deploy oficial.
 * Em development permite abrir o painel mesmo com tripwire de Supabase prod (health fica RED).
 */
export function isBicLabPageReachableServer(env: NodeJS.ProcessEnv = process.env): boolean {
  const boundary = evaluateBicLabBoundary(env);
  if (boundary.productionLocked) return false;
  if (!parseFlag(env[SERVER_FLAG])) return false;
  if (env.NODE_ENV === "development") return true;
  return isBicBoundaryClearForLabOperation(env);
}

export function isBicLabEnabledClient(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK === "true") return false;
  return parseFlag(process.env[CLIENT_FLAG]);
}
