/**
 * Autoridade de leitura BIC (hub central) — caminho único LAB → homolog → produção.
 *
 * - LAB: flags HB_BIC_LAB_B4_AUTHORITY (espelho atual)
 * - Homolog/preview: NEXT_PUBLIC_BIC_CENTRAL_READ=true
 * - Produção oficial: só com NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL=true (fail-closed com production lock)
 */
import { evaluateBicLabBoundary } from "@/lib/lab/bicLabBoundary";
import { isBicLabB4AuthorityEnabled } from "@/lib/lab/bicLabB4Authority";

const ALLOWED_ON = new Set(["true", "1", "yes"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

/** Leitura financeira cooperado via bicLeituraCentral* (substitui ramos legados na UI). */
export function isBicCentralReadAuthorityEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isBicLabB4AuthorityEnabled(env)) return true;

  const boundary = evaluateBicLabBoundary(env);
  if (boundary.productionLocked) {
    return parseFlag(env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL);
  }

  return parseFlag(env.NEXT_PUBLIC_BIC_CENTRAL_READ);
}
