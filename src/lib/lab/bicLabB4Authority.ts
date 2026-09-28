/**
 * B4 somente LAB — BIC como centro de leitura/projeção cooperado.
 * Fail-closed no deploy oficial de produção.
 */

import { evaluateBicLabBoundary, isBicBoundaryClearForLabOperation } from "./bicLabBoundary";

const B4_FLAG = "HB_BIC_LAB_B4_AUTHORITY";
const LAB_FLAG = "HB_BIC_LAB_ENABLED";

const ALLOWED_ON = new Set(["true", "1", "yes"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

export function isBicLabB4AuthorityEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!parseFlag(env[B4_FLAG])) return false;
  const boundary = evaluateBicLabBoundary(env);
  if (boundary.productionLocked) return false;
  if (!parseFlag(env[LAB_FLAG])) return false;
  if (env.NODE_ENV === "development") return true;
  return isBicBoundaryClearForLabOperation(env);
}
