/**
 * Hidratação da gestão após limpeza de cache / AppData vazio.
 * Pull operacional (PIX, fichas pagas, livro, contratos) sem push do snapshot pobre.
 */
import type { AppData } from "@/types";
import type { SyncTierPlan84 } from "@/lib/performance/syncPlan84";

const STAFF_OPERACIONAL_PULL_APLICADO_KEY = "hb-staff-operacional-pull-aplicado";
const STAFF_GESTAO_ABERTURA_SYNC_KEY = "hb-staff-gestao-abertura-sync";

let staffOperacionalPullAplicadoMem = false;
let staffGestaoAberturaSyncMem = false;

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

/** Uma abertura automática por sessão no PC (notas_delta ou financeiro_delta). */
export function markStaffGestaoAberturaSyncConcluido(): void {
  staffGestaoAberturaSyncMem = true;
  const storage = staffOperacionalPullStorage();
  if (!storage) return;
  try {
    storage.setItem(STAFF_GESTAO_ABERTURA_SYNC_KEY, "1");
  } catch {
    /* quota */
  }
}

export function staffGestaoAberturaSyncJaConcluido(): boolean {
  if (staffGestaoAberturaSyncMem) return true;
  const storage = staffOperacionalPullStorage();
  if (!storage) return false;
  try {
    return storage.getItem(STAFF_GESTAO_ABERTURA_SYNC_KEY) === "1";
  } catch {
    return false;
  }
}

/** Somente testes. */
export function resetStaffOperacionalColdHydrateForTests(): void {
  staffOperacionalPullAplicadoMem = false;
  staffGestaoAberturaSyncMem = false;
  const storage = staffOperacionalPullStorage();
  if (!storage) return;
  try {
    storage.removeItem(STAFF_OPERACIONAL_PULL_APLICADO_KEY);
    storage.removeItem(STAFF_GESTAO_ABERTURA_SYNC_KEY);
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

/** Já há ficha/notas no aparelho (abertura ainda puxa PIX se o financeiro estiver vazio). */
export function staffGestaoTemFichaOuNotaLocal(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  if (!data) return false;
  if ((data.fichaCorrida ?? []).some((f) => pertenceCoop(f, coopId))) return true;
  if ((data.notasPedido ?? []).some((n) => pertenceCoop(n, coopId))) return true;
  return false;
}

/**
 * Livro/PIX sem `fichaCorrida` no escopo — totais «a pagar» zeram no responsável.
 */
export function staffGestaoFaltaFichaOperacionalNoEscopo(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  if (!data || !coopId) return false;
  const ativos = data.cooperados.filter(
    (c) => c.cooperativaId === coopId && c.status === "ativo"
  ).length;
  if (ativos === 0) return false;
  const fichas = (data.fichaCorrida ?? []).filter((f) => pertenceCoop(f, coopId));
  if (fichas.length > 0) return false;
  const notas = (data.notasPedido ?? []).filter((n) => pertenceCoop(n, coopId));
  const livro = (data.livroCaixa ?? []).filter((l) => pertenceCoop(l, coopId));
  const pix = (data.pagamentosCooperado ?? []).filter((p) => pertenceCoop(p, coopId));
  return notas.length > 0 || livro.length > 0 || pix.length > 0;
}

/** Entrega/ficha local sem PIX confirmado no escopo — puxa backup da nuvem na abertura. */
export function staffGestaoEntregaSemPixNoEscopo(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  if (!data || !coopId) return false;
  const pix = (data.pagamentosCooperado ?? []).filter((p) => pertenceCoop(p, coopId));
  if (pix.length > 0) return false;
  return staffGestaoTemFichaOuNotaLocal(data, coopId);
}

export function staffPrecisaHydrateOperacionalPull(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  if (staffLocalOperacionalVazio(data, coopId)) {
    const jaHidratouNestaSessao =
      staffOperacionalPullJaAplicado() && staffGestaoTemFichaOuNotaLocal(data, coopId);
    if (!jaHidratouNestaSessao) return true;
  }
  if (staffCooperadosCadastroAusente(data, coopId)) {
    if (!staffOperacionalPullJaAplicado()) return true;
  }
  if (staffGestaoFaltaFichaOperacionalNoEscopo(data, coopId)) {
    if (!staffOperacionalPullJaAplicado()) return true;
  }
  return false;
}

/** Operacional local sem cadastro de cooperados (nomes e A pagar zeravam). */
export function staffCooperadosCadastroAusente(
  data: AppData | null | undefined,
  coopId?: string
): boolean {
  if (!data || !coopId) return false;
  const cadastrados = data.cooperados.filter((c) => c.cooperativaId === coopId).length;
  if (cadastrados > 0) return false;
  if ((data.fichaCorrida ?? []).some((f) => pertenceCoop(f, coopId))) return true;
  if ((data.notasPedido ?? []).some((n) => pertenceCoop(n, coopId))) return true;
  if ((data.pagamentosCooperado ?? []).some((p) => pertenceCoop(p, coopId))) return true;
  return false;
}

/** Expande o plano HX 8.4: puxa tudo e desliga push bidirecional. */
export function expandStaffTierPlanIfOperacionalVazio(
  plan: SyncTierPlan84,
  data: AppData | null | undefined,
  coopId?: string,
  opts?: { staffLiveBackground?: boolean; staffUserInitiated?: boolean }
): SyncTierPlan84 {
  if (!opts?.staffUserInitiated && staffCooperadosCadastroAusente(data, coopId)) {
    return {
      ...plan,
      bidirectionalFull: false,
      pullProfile: true,
      pullCooperados: true,
      pullNotas: true,
      pullOperacional: staffLocalOperacionalVazio(data, coopId),
      pullContratos: plan.pullContratos ?? false,
    };
  }
  // Toque em Atualizar: puxa notas + operacional (skipDestructiveReset no pull — não zera lastro).
  if (opts?.staffUserInitiated) {
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
  if (!staffLocalOperacionalVazio(data, coopId)) return plan;
  if (opts?.staffLiveBackground) {
    return { ...plan, bidirectionalFull: false, pullOperacional: false };
  }
  // idle/Início (pulse) não puxa operacional — evita zerar no toque da aba.
  if (plan.tier === "pulse") {
    return { ...plan, bidirectionalFull: false };
  }
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
