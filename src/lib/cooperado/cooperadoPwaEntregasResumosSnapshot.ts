/**
 * Cache local dos resumos da aba Entregas/Ficha (cooperado PWA mobile) — evita recalcular a cada sync.
 */
import type { User } from "@/types";
import type { AppData } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import { listarResumosExtratoHistoricoCooperado } from "@/services/cooperadoEntregasService";
import { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";
import {
  listarResumosFichaCompletaCooperado,
  listarResumosFotosFichaTodas,
  mesclarResumosFichaCompletaFontes,
} from "@/lib/cooperado/cooperadoFotosFichaContrato";
import { bicCentralListarResumosMensaisEntregas } from "@/services/bicLeituraCentralCooperado";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import {
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT,
  dispatchCooperadoPwaLeveUiSnapshotRefresh,
} from "@/lib/cooperado/cooperadoPwaLeveUiEvents";

export const COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION = 2;

export const COOPERADO_PWA_ENTREGAS_SNAPSHOT_REFRESH_EVENT =
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT;

export type CooperadoPwaEntregasResumosSnapshot = {
  v: number;
  appBuild: number;
  savedAt: string;
  /** Base mensal (antes do filtro de status na UI). */
  entregasBase: ResumoMesEntregasCooperado[];
  fichaAberto: ResumoMesEntregasCooperado[];
  /** Extrato da Ficha: todos os meses com entrega, ficha ou PIX. */
  fichaExtrato?: ResumoMesEntregasCooperado[];
  /** Fotos por mês — todos os meses com foto. */
  fotosFichaLiquidada?: ResumoMesEntregasCooperado[];
  pagamentosRealizados: ResumoMesEntregasCooperado[];
};

function storageKeyForVersion(
  version: number,
  cooperadoId: string,
  cooperativaId: string
): string {
  return `hb.coop.pwaEntregasResumos.v${version}:${cooperativaId}:${cooperadoId}`;
}

function storageKey(cooperadoId: string, cooperativaId: string): string {
  return storageKeyForVersion(COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION, cooperadoId, cooperativaId);
}

export type BuildCooperadoPwaEntregasSnapshotOpts = {
  /** Fase rápida após sync — histórico PIX completo fica para idle. */
  omitirPagamentosHistorico?: boolean;
  pagamentosRealizadosAnteriores?: ResumoMesEntregasCooperado[];
  fotosFichaLiquidadaAnteriores?: ResumoMesEntregasCooperado[];
};

export function buildCooperadoPwaEntregasResumosSnapshot(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  opts?: BuildCooperadoPwaEntregasSnapshotOpts
): CooperadoPwaEntregasResumosSnapshot {
  const entregasBase = bicCentralListarResumosMensaisEntregas(data, cooperadoId, cooperativaId);
  const fichaAberto = listarResumosFichaEmAbertoCooperado(data, cooperadoId, cooperativaId);
  const pagamentosRealizados = opts?.omitirPagamentosHistorico
    ? (opts.pagamentosRealizadosAnteriores ?? [])
    : listarResumosExtratoHistoricoCooperado(data, cooperadoId, cooperativaId);
  const fichaExtrato = listarResumosFichaCompletaCooperado(data, cooperadoId, cooperativaId);
  const fotosTodas = listarResumosFotosFichaTodas(data, cooperadoId, cooperativaId);
  const fotosFichaLiquidada =
    opts?.omitirPagamentosHistorico && (opts.fotosFichaLiquidadaAnteriores?.length ?? 0) > fotosTodas.length
      ? opts.fotosFichaLiquidadaAnteriores!
      : fotosTodas;
  return {
    v: COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION,
    appBuild: APP_BUILD_VERSION,
    savedAt: new Date().toISOString(),
    entregasBase,
    fichaAberto,
    fichaExtrato,
    fotosFichaLiquidada,
    pagamentosRealizados,
  };
}

export function lerCooperadoPwaEntregasResumosSnapshot(
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaEntregasResumosSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    let raw = localStorage.getItem(storageKey(cooperadoId, cooperativaId));
    if (!raw) raw = localStorage.getItem(storageKeyForVersion(1, cooperadoId, cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPwaEntregasResumosSnapshot;
    if ((parsed.v !== COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION && parsed.v !== 1) || !Array.isArray(parsed.entregasBase)) {
      return null;
    }
    if (!cooperadoPwaSnapshotBuildReadable(parsed.appBuild)) return null;
    return {
      ...parsed,
      pagamentosRealizados: Array.isArray(parsed.pagamentosRealizados)
        ? parsed.pagamentosRealizados
        : [],
      fichaExtrato: Array.isArray(parsed.fichaExtrato) ? parsed.fichaExtrato : undefined,
      fotosFichaLiquidada: Array.isArray(parsed.fotosFichaLiquidada)
        ? parsed.fotosFichaLiquidada
        : undefined,
    };
  } catch {
    return null;
  }
}

export function gravarCooperadoPwaEntregasResumosSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  payload: CooperadoPwaEntregasResumosSnapshot
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(cooperadoId, cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function persistirCooperadoPwaEntregasResumosSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  data?: AppData | null,
  opts?: BuildCooperadoPwaEntregasSnapshotOpts
): CooperadoPwaEntregasResumosSnapshot | null {
  const d = data ?? (isAppDataWarm() ? getData() : null);
  if (!d) return null;
  const canon = resolverCooperadoIdCanonico(d, cooperadoId, cooperativaId);
  const previous = lerCooperadoPwaEntregasResumosSnapshot(canon, cooperativaId);
  const built = buildCooperadoPwaEntregasResumosSnapshot(d, canon, cooperativaId, opts);
  const prevTemValor =
    (previous?.entregasBase.length ?? 0) > 0 ||
    (previous?.fichaExtrato?.length ?? 0) > 0 ||
    (previous?.fichaAberto.length ?? 0) > 0;
  const builtTemValor =
    built.entregasBase.length > 0 ||
    (built.fichaExtrato?.length ?? 0) > 0 ||
    built.fichaAberto.length > 0;
  if (prevTemValor && !builtTemValor) {
    return previous;
  }
  const merged: CooperadoPwaEntregasResumosSnapshot = {
    ...built,
    entregasBase: mesclarResumosFichaCompletaFontes(built.entregasBase, previous?.entregasBase),
    fichaAberto: mesclarResumosFichaCompletaFontes(built.fichaAberto, previous?.fichaAberto),
    fichaExtrato: mesclarResumosFichaCompletaFontes(built.fichaExtrato, previous?.fichaExtrato),
    fotosFichaLiquidada: mesclarResumosFichaCompletaFontes(
      built.fotosFichaLiquidada,
      previous?.fotosFichaLiquidada
    ),
    pagamentosRealizados: mesclarResumosFichaCompletaFontes(
      built.pagamentosRealizados,
      previous?.pagamentosRealizados
    ),
  };
  gravarCooperadoPwaEntregasResumosSnapshot(canon, cooperativaId, merged);
  return merged;
}

export function persistirCooperadoPwaEntregasResumosSnapshotFromUser(
  user: Omit<User, "password">
): CooperadoPwaEntregasResumosSnapshot | null {
  if (user.role !== "cooperado" || !user.cooperadoId) return null;
  const d = isAppDataWarm() ? getData() : null;
  const coopId = (d ? getUserCooperativaId(user, d) : undefined) ?? user.cooperativaId;
  if (!coopId) return null;
  return persistirCooperadoPwaEntregasResumosSnapshot(user.cooperadoId, coopId, d);
}

export function dispatchCooperadoPwaEntregasSnapshotRefresh(): void {
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
}
