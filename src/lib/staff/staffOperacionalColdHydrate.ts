/**
 * Hidratação da gestão após limpeza de cache / AppData vazio.
 * Pull operacional (PIX, fichas pagas, livro, contratos) sem push do snapshot pobre.
 */
import type { AppData } from "@/types";
import type { SyncTierPlan84 } from "@/lib/performance/syncPlan84";

const STAFF_OPERACIONAL_PULL_APLICADO_KEY = "hb-staff-operacional-pull-aplicado";

let staffOperacionalPullAplicadoMem = false;

function staffOperacionalPullStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markStaffOperacionalPullAplicado(): void {
  staffOperacionalPullAplicadoMem = true;
  const storage = staffOperacionalPullStorage();
  if (!storage) return;
  try {
    storage.setItem(STAFF_OPERACIONAL_PULL_APLICADO_KEY, "1");
  } catch {
    /* quota */
  }
}

export function staffOperacionalPullJaAplicado(): boolean {
  if (staffOperacionalPullAplicadoMem) return true;
  const storage = staffOperacionalPullStorage();
  if (!storage) return false;
  try {
    return storage.getItem(STAFF_OPERACIONAL_PULL_APLICADO_KEY) === "1";
  } catch {
    return false;
  }
}

/** Somente testes. */
export function resetStaffOperacionalColdHydrateForTests(): void {
  staffOperacionalPullAplicadoMem = false;
  const storage = staffOperacionalPullStorage();
  if (!storage) return;
  try {
    storage.removeItem(STAFF_OPERACIONAL_PULL_APLICADO_KEY);
  } catch {
    /* ignore */
  }
}

function pertenceCoop<T extends { cooperativaId?: string }>(item: T, coopId?: string): boolean {
  return !coopId || item.cooperativaId === coopId;
}

/**
 * Aparelho sem financeiro aplicado (cache limpo ou só fichas reconstruídas das notas).
 * PIX/livro vazios = precisa pull operacional; não publica esse estado.
 */
export function staffLocalOperacionalVazio(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  if (!data) return true;
  const pagamentos = (data.pagamentosCooperado ?? []).filter((p) => pertenceCoop(p, coopId));
  const livro = (data.livroCaixa ?? []).filter((l) => pertenceCoop(l, coopId));
  return pagamentos.length === 0 && livro.length === 0;
}

export function staffPrecisaHydrateOperacionalPull(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  return staffLocalOperacionalVazio(data, coopId);
}

/** Expande o plano HX 8.4: puxa tudo e desliga push bidirecional. */
export function expandStaffTierPlanIfOperacionalVazio(
  plan: SyncTierPlan84,
  data: AppData | null | undefined,
  coopId?: string
): SyncTierPlan84 {
  if (!staffLocalOperacionalVazio(data, coopId)) return plan;
  return {
    ...plan,
    bidirectionalFull: false,
    pullProfile: true,
    pullCooperados: true,
    pullNotas: true,
    pullOperacional: true,
    pullContratos: true,
  };
}

/**
 * Cliente da gestão, ainda sem pull operacional nesta sessão:
 * não fabricar 861 fichas pendente a partir das notas.
 * Servidor / cooperado / pós-pull: regra atual.
 */
export function deveAdiarReconciliarFichaAposLimpezaCacheStaff(
  data: AppData,
  coopId?: string
): boolean {
  if (typeof window === "undefined") return false;
  if ((data.fichaCorrida ?? []).some((f) => !coopId || f.cooperativaId === coopId)) {
    return false;
  }
  if (!staffLocalOperacionalVazio(data, coopId)) return false;
  if (staffOperacionalPullJaAplicado()) return false;
  return true;
}
