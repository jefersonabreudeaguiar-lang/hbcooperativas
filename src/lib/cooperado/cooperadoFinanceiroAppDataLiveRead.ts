/**
 * Modo híbrido cooperado — valor a receber / Financeiro / Início leem direto do AppData
 * (paridade + motores legados), sem projeção BIC na UI.
 *
 * Padrão produção: false (BIC é a fonte). Rollback AppData direto: =true
 * (manter NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL=true).
 *
 * Performance: só um parse de flag em build; sem I/O extra.
 */
const ALLOWED_ON = new Set(["true", "1", "yes"]);

function parseFlag(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  return ALLOWED_ON.has(raw.trim().toLowerCase());
}

export function isCooperadoFinanceiroAppDataLiveRead(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return parseFlag(env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE);
}
