/**
 * Reidrata snapshots PWA a partir do AppData local (sem sync na nuvem) quando build/snapshot v2 faltam.
 */
import type { User } from "@/types";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import {
  lerCooperadoPwaFichaResumoSnapshot,
  resolveParidadeFromFichaResumoSnapshot,
} from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { leituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import type { AppData } from "@/types";
import {
  isCooperadoPwaMessengerMode,
  persistirCooperadoPwaMessengerCaches,
} from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  filtrarInicioCardPersistidoLeituraBic,
  cooperadoMotorTemObrigacaoReceber,
} from "@/lib/cooperadoInicioCardPolicy";
import { lerInicioCardFinanceiroExibicao } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { lerInicioCardPersistidoFlex } from "@/lib/cooperadoInicioCardPersistencia";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";

const PARIDADE_SNAP_DRIFT_EPS = 0.02;

/** Snapshot de ficha com paridade zerada enquanto AppData local tem valor — trava Financeiro/Início. */
export function cooperadoPwaFichaParidadeSnapshotDivergeDeAppData(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const snap = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  if (!snap || !cooperadoPwaSnapshotBuildReadable(snap.appBuild)) return false;
  const fromSnap = resolveParidadeFromFichaResumoSnapshot(snap);
  if (!fromSnap) return false;
  const live = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const snapVal = fromSnap.valorLiquido ?? 0;
  const liveVal = live.valorLiquido ?? 0;
  if (liveVal > 0.005 && snapVal <= 0.005) return true;
  if (liveVal > 0.005 && Math.abs(snapVal - liveVal) > PARIDADE_SNAP_DRIFT_EPS) return true;
  return false;
}

/** Snapshots v2 gravados após sync — inclusive saldo zerado (não exige “a receber” > 0). */
export function cooperadoPwaFinanceiroSnapshotsMaterializados(
  cooperadoId: string,
  cooperativaId: string | undefined
): boolean {
  const card =
    lerInicioCardFinanceiroExibicao(cooperadoId, cooperativaId) ??
    filtrarInicioCardPersistidoLeituraBic(
      lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
    );
  if (card?.display && cooperadoMotorTemObrigacaoReceber(card.display)) {
    return true;
  }
  if (!cooperativaId) return false;
  const ficha = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  const fichaOk = Boolean(
    ficha &&
      ficha.v >= 2 &&
      ficha.paridade &&
      cooperadoPwaSnapshotBuildReadable(ficha.appBuild)
  );
  if (!fichaOk) return false;
  if (isAppDataWarm()) {
    const data = getData();
    if (cooperadoPwaFichaParidadeSnapshotDivergeDeAppData(data, cooperadoId, cooperativaId)) {
      return false;
    }
  }
  return true;
}

/** Após limpar cache do PWA — sem card/ficha local o Início zera (HB Créditos ainda vem da API). */
export function cooperadoPwaFinanceiroSnapshotsAusentes(
  cooperadoId: string,
  cooperativaId: string | undefined
): boolean {
  return !cooperadoPwaFinanceiroSnapshotsMaterializados(cooperadoId, cooperativaId);
}

export function cooperadoPwaFichaSnapshotPrecisaRematerializar(
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const snap = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  if (!snap) return true;
  if (!cooperadoPwaSnapshotBuildReadable(snap.appBuild)) return true;
  if (snap.v < 2 || !snap.paridade) return true;
  if (isAppDataWarm()) {
    const data = getData();
    if (cooperadoPwaFichaParidadeSnapshotDivergeDeAppData(data, cooperadoId, cooperativaId)) {
      return true;
    }
  }
  return false;
}

/** AppData já warm no dispositivo — grava snapshots v2 sem ir à nuvem. */
export function rematerializarCooperadoPwaSnapshotsSeNecessario(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (!isAppDataWarm()) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);

  if (isCooperadoMobileGaPromoted(user)) {
    if (!cooperadoPwaFichaSnapshotPrecisaRematerializar(canon, coopId)) {
      const cardOk = cooperadoPwaFinanceiroSnapshotsMaterializados(canon, coopId);
      if (cardOk) return false;
    }
    return cooperadoRematerializarFinanceiroLocalSePossivel(user);
  }

  if (!isCooperadoPwaMessengerMode()) return false;
  if (!cooperadoPwaFichaSnapshotPrecisaRematerializar(canon, coopId)) return false;
  persistirCooperadoPwaMessengerCaches(user);
  return true;
}

export function cooperadoPwaMessengerPrecisaSyncOperacionalInicial(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return false;
  if (isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoAppReleaseNeedsOperacionalSync()) {
    if (isCooperadoMobileGaPromoted(user) && isAppDataWarm()) {
      const data = getData();
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (coopId && user.cooperadoId) {
        const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
        if (cooperadoTemDadosFinanceirosMinimos(data, canon, coopId)) {
          return false;
        }
      }
    }
    return true;
  }
  const data = isAppDataWarm() ? getData() : null;
  const coopId = data
    ? getUserCooperativaId(user, data) ?? user.cooperativaId
    : user.cooperativaId;
  if (!coopId || !user.cooperadoId) return true;
  const canon = data
    ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
    : user.cooperadoId;
  if (cooperadoPwaFinanceiroSnapshotsAusentes(canon, coopId)) return true;
  if (!isAppDataWarm()) return true;
  return cooperadoPwaFichaSnapshotPrecisaRematerializar(canon, coopId);
}
