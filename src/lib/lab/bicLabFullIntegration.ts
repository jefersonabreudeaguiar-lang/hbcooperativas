/**
 * BIC LAB 100% — integração completa de leitura (somente laboratório).
 */
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { evaluateBicLabBoundary } from "@/lib/lab/bicLabBoundary";

const FULL_LAB_FLAG = "HB_BIC_LAB_FULL";
const FULL_OFFICIAL_FLAG = "NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL";

const ALLOWED_ON = new Set(["true", "1", "yes"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

/** Leitura ficha/dashboard unificada — LAB FULL ou flag oficial equivalente. */
export function isBicLabFullIntegrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isBicCentralReadAuthorityEnabled(env)) return false;
  if (parseFlag(env[FULL_LAB_FLAG])) return true;
  const boundary = evaluateBicLabBoundary(env);
  if (boundary.productionLocked) {
    return parseFlag(env[FULL_OFFICIAL_FLAG]);
  }
  return false;
}
