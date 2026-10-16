/**
 * Concerto BIC — Movimento IV: sync silencioso; badge de sync só se dados “velhos” na aba Financeiro.
 */
import { isCooperadoBicSonataSyncUiEnabled } from "@/lib/bic/bicParidadeHealth";

const FRESH_KEY = "hb.bic.financeiroFreshAt";
export const COOPERADO_BIC_FINANCEIRO_STALE_MS = 60_000;

export function markCooperadoBicFinanceiroFresh(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(FRESH_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}

export function readCooperadoBicFinanceiroFreshAt(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FRESH_KEY);
    if (!raw) return null;
    const t = parseInt(raw, 10);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function cooperadoBicFinanceiroDadosStale(
  staleMs = COOPERADO_BIC_FINANCEIRO_STALE_MS
): boolean {
  const at = readCooperadoBicFinanceiroFreshAt();
  if (at == null) return true;
  return Date.now() - at > staleMs;
}

/**
 * Suprime spinner de sync na ficha até dados ficarem stale (>60s) — início continua snapshot-first.
 */
export function cooperadoBicFinanceiroSyncHintForUi(
  syncingForUi: boolean,
  opts: { onFinanceiroScreen: boolean; cooperadoBicAuthority: boolean }
): boolean {
  if (!syncingForUi) return false;
  if (!isCooperadoBicSonataSyncUiEnabled()) return syncingForUi;
  if (!opts.cooperadoBicAuthority || !opts.onFinanceiroScreen) return syncingForUi;
  return cooperadoBicFinanceiroDadosStale();
}
