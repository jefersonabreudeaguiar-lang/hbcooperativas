/**
 * Concerto BIC — Movimento I: rollback por superfície sem desligar a autoridade BIC global.
 */
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";

export type BicLeituraSuperficie =
  | "cooperado"
  | "staff"
  | "hb_credito"
  | "admin"
  | "relatorios";

const SURFACE_ENV_KEY: Record<BicLeituraSuperficie, string> = {
  cooperado: "NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO",
  staff: "NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF",
  hb_credito: "NEXT_PUBLIC_BIC_LEITURA_PORTA_HB_CREDITO",
  admin: "NEXT_PUBLIC_BIC_LEITURA_PORTA_ADMIN",
  relatorios: "NEXT_PUBLIC_BIC_LEITURA_PORTA_RELATORIOS",
};

function parseTriState(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return null;
}

/** Desliga todas as superfícies da porta (rollback do Movimento I) mantendo BIC official. */
export function isBicLeituraPortaGlobalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const master = parseTriState(env.NEXT_PUBLIC_BIC_LEITURA_PORTA);
  if (master === false) return false;
  return true;
}

/** Superfície usa o hub `bicLeituraPorta` (fail-closed: BIC authority + master ≠ off + flag da superfície). */
export function isBicLeituraPortaAtiva(
  superficie: BicLeituraSuperficie,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isBicCentralReadAuthorityEnabled(env)) return false;
  if (!isBicLeituraPortaGlobalEnabled(env)) return false;
  return parseTriState(env[SURFACE_ENV_KEY[superficie]]) === true;
}

export function listBicLeituraPortaSuperficiesAtivas(
  env: NodeJS.ProcessEnv = process.env
): BicLeituraSuperficie[] {
  const all: BicLeituraSuperficie[] = [
    "cooperado",
    "staff",
    "hb_credito",
    "admin",
    "relatorios",
  ];
  return all.filter((s) => isBicLeituraPortaAtiva(s, env));
}
