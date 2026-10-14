/**
 * Reidrata snapshots PWA a partir do AppData local (sem sync na nuvem) quando build/snapshot v2 faltam.
 */
import type { User } from "@/types";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { lerCooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
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
  if (card?.display) {
    if (cooperadoMotorTemObrigacaoReceber(card.display)) return true;
    if (cooperadoPwaSnapshotBuildReadable(card.appBuild)) return true;
  }
  if (!cooperativaId) return false;
  const ficha = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  return Boolean(
    ficha &&
      ficha.v >= 2 &&
      ficha.paridade &&
      cooperadoPwaSnapshotBuildReadable(ficha.appBuild)
  );
}

/** Após limpar cache do PWA — sem card/ficha local o Início zera (HB Créditos ainda vem da API). */
export function cooperadoPwaFinanceiroSnapshotsAusentes(
  cooperadoId: string,
  cooperativaId: string | undefined
): boolean {
  if (cooperadoPwaFinanceiroSnapshotsMaterializados(cooperadoId, cooperativaId)) return false;
  if (!cooperativaId) return true;
  const card = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
  );
  if (card?.display && cooperadoMotorTemObrigacaoReceber(card.display)) return false;
  const ficha = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  if (ficha?.paridade && (ficha.paridade.valorLiquido ?? 0) > 0.005) return false;
  return !card && !ficha;
}

export function cooperadoPwaFichaSnapshotPrecisaRematerializar(
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const snap = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  if (!snap) return true;
  if (!cooperadoPwaSnapshotBuildReadable(snap.appBuild)) return true;
  if (snap.v < 2 || !snap.paridade) return true;
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
