/**
 * Read model leve da aba Financeiro/Ficha (cooperado PWA mensageiro) — materializado pós-sync.
 */
import type { AppData, User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoBicAutorizaZerarCardInicio } from "@/lib/cooperadoInicioCardPolicy";
import { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";
import { agregarItensFichaMeses } from "@/services/notaPedidoService";
import { bicCentralMesPrincipalQuantoVouReceber } from "@/services/bicLeituraCentralCooperado";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";

export const COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION = 2;

export type CooperadoPwaFichaResumoSnapshot = {
  v: number;
  appBuild: number;
  savedAt: string;
  fichaAberto: ResumoMesEntregasCooperado[];
  mesPrincipal: ReturnType<typeof bicCentralMesPrincipalQuantoVouReceber>;
  consolidado: LeituraFinanceiraParidadeCooperado["consolidado"];
  /** Paridade Financeiro (v2+) — leitura somente nas abas. */
  paridade?: LeituraFinanceiraParidadeCooperado;
  /** Itens das entregas em aberto — o Financeiro reabre com a mesma tabela. */
  itensEntregas?: ReturnType<typeof agregarItensFichaMeses>;
};

function storageKeyForVersion(
  version: number,
  cooperadoId: string,
  cooperativaId: string
): string {
  return `hb.coop.pwaFichaResumo.v${version}:${cooperativaId}:${cooperadoId}`;
}

function storageKey(cooperadoId: string, cooperativaId: string): string {
  return storageKeyForVersion(COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION, cooperadoId, cooperativaId);
}

/** v1 sem `paridade` — deriva do consolidado materializado. */
export function resolveParidadeFromFichaResumoSnapshot(
  snap: CooperadoPwaFichaResumoSnapshot
): LeituraFinanceiraParidadeCooperado | null {
  if (snap.paridade) return snap.paridade;
  const c = snap.consolidado;
  if (!c) return null;
  const mesesResumo = c.meses?.length ? [...c.meses] : [];
  return {
    consolidado: c,
    mesesResumo,
    valorLiquido: c.valorLiquido ?? 0,
    mesLabel: c.mesLabel ?? "",
    resumo: c.resumo,
    descontosExtras: [],
  };
}

export function buildCooperadoPwaFichaResumoSnapshot(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  apresentacaoConsolidada: boolean
): CooperadoPwaFichaResumoSnapshot {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const fichaAberto = listarResumosFichaEmAbertoCooperado(data, canon, cooperativaId);
  const paridade = cooperadoLeituraFinanceiraExibicao(data, canon, cooperativaId, {
    apresentacaoConsolidada,
  });
  const mesesPar = paridade.mesesResumo;
  const mesPrincipal =
    mesesPar[mesesPar.length - 1] ??
    mesesPar[0] ??
    bicCentralMesPrincipalQuantoVouReceber(data, canon, cooperativaId, {
      apresentacaoConsolidada,
    });
  const consolidado = paridade.consolidado;
  const mesesItens = paridade.mesesResumo.length > 0 ? paridade.mesesResumo : [mesPrincipal];
  const itensEntregas = agregarItensFichaMeses(data, canon, mesesItens, cooperativaId, {
    apenasPendentes: true,
  });
  return {
    v: COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION,
    appBuild: APP_BUILD_VERSION,
    savedAt: new Date().toISOString(),
    fichaAberto,
    mesPrincipal,
    consolidado,
    paridade,
    itensEntregas,
  };
}

function parseFichaResumoSnapshotRaw(raw: string): CooperadoPwaFichaResumoSnapshot | null {
  const parsed = JSON.parse(raw) as CooperadoPwaFichaResumoSnapshot;
  if (
    (parsed.v !== COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION && parsed.v !== 1) ||
    !Array.isArray(parsed.fichaAberto)
  ) {
    return null;
  }
  if (!cooperadoPwaSnapshotBuildReadable(parsed.appBuild)) return null;
  return parsed;
}

export function lerCooperadoPwaFichaResumoSnapshot(
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaFichaResumoSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    for (const version of [COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION, 1] as const) {
      const raw = localStorage.getItem(storageKeyForVersion(version, cooperadoId, cooperativaId));
      if (!raw) continue;
      const parsed = parseFichaResumoSnapshotRaw(raw);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function gravarCooperadoPwaFichaResumoSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  payload: CooperadoPwaFichaResumoSnapshot
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(cooperadoId, cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function persistirCooperadoPwaFichaResumoSnapshotFromUser(
  user: Omit<User, "password">,
  apresentacaoConsolidada = true
): CooperadoPwaFichaResumoSnapshot | null {
  if (user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return null;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return null;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const built = buildCooperadoPwaFichaResumoSnapshot(data, canon, coopId, apresentacaoConsolidada);
  const previous = lerCooperadoPwaFichaResumoSnapshot(canon, coopId);
  const prevValor = previous?.paridade?.valorLiquido ?? previous?.consolidado?.valorLiquido ?? 0;
  const nextValor = built.paridade?.valorLiquido ?? 0;
  if (prevValor > 0.005 && nextValor <= 0.005 && !cooperadoBicAutorizaZerarCardInicio(data, canon, coopId)) {
    return previous;
  }
  if (
    cooperadoAppReleaseNeedsOperacionalSync() &&
    nextValor <= 0.005
  ) {
    return previous;
  }
  gravarCooperadoPwaFichaResumoSnapshot(canon, coopId, built);
  return built;
}
