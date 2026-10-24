import type { User } from "@/types";
import {
  cooperadoMotorTemObrigacaoReceber,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import { cooperadoPilotMotorCardInicioTemValor } from "@/lib/cooperado/cooperadoMobilePilotInicioValorLocal";
import {
  cooperadoFinanceiroCardCacheTemValor,
  cooperadoFinanceiroExibicaoDivergeDoMotorLocal,
  lerInicioCardFinanceiroExibicao,
} from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { cooperadoTemReciboAssinadoLocalSemPendenciaUi } from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
import { lerHbCreditAccountPersistidoFlex } from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoOperacionalSyncStale } from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { cooperadoPwaFinanceiroSnapshotsAusentes } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

export function cooperadoHbCreditCacheTemValor(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  const apiId = resolveHbCreditApiCooperadoId(user, user.cooperadoId);
  const cnpj = user.cooperativaCnpj ? normalizeCnpj(user.cooperativaCnpj) : "";
  const snap = lerHbCreditAccountPersistidoFlex(apiId, cnpj.length === 14 ? cnpj : undefined);
  const acc = snap?.account;
  if (!acc) return false;
  return (
    Math.max(0, acc.limiteLiberadoCents ?? 0) > 0 ||
    Math.max(0, acc.valorDisponivelCents ?? 0) > 0 ||
    Math.max(0, acc.valorUsadoCents ?? 0) > 0
  );
}

/** Card/HB com valor positivo — ou zero com prova local (recibo) e ficha alinhada. */
export function cooperadoGaExibicaoFinanceiraConfiavel(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoFinanceiroCardCacheTemValor(user) || cooperadoHbCreditCacheTemValor(user)) {
    if (cooperadoFinanceiroExibicaoDivergeDoMotorLocal(user)) return false;
    return true;
  }
  if (!isAppDataWarm() || !user.cooperadoId) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, coopId);
  /** Motor local com fatia mínima — mesmo “desatualizado” de ficha, não reabrir tempestade GA (v538 UX + v547). */
  if (paridade.valorLiquido > 0.01 && cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) {
    return true;
  }
  if (
    paridade.valorLiquido > 0.01 &&
    !cooperadoFinanceiroCardCacheTemValor(user) &&
    cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId)
  ) {
    return false;
  }
  if (cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId)) return false;
  if (!cooperadoTemReciboAssinadoLocalSemPendenciaUi(data, cooperadoId, coopId)) return false;
  const card = lerInicioCardFinanceiroExibicao(cooperadoId, coopId);
  return Boolean(card?.display && !cooperadoMotorTemObrigacaoReceber(card.display));
}

/** UI zerada com fatia local ou build novo — precisa operacional_full silencioso. */
export function cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoGaExibicaoFinanceiraConfiavel(user)) return false;
  if (cooperadoFinanceiroCardCacheTemValor(user) || cooperadoHbCreditCacheTemValor(user)) {
    return false;
  }
  if (!isAppDataWarm()) return true;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId || !user.cooperadoId) return false;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) {
    return false;
  }
  if (cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId)) return true;
  if (cooperadoPwaFinanceiroSnapshotsAusentes(cooperadoId, coopId)) {
    const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, coopId);
    if (paridade.valorLiquido > 0.01) return false;
    return true;
  }
  const card = lerInicioCardFinanceiroExibicao(cooperadoId, coopId);
  const cardSemValor =
    !card?.display || !cooperadoMotorTemObrigacaoReceber(card.display);
  if (
    cardSemValor &&
    !cooperadoFinanceiroCardCacheTemValor(user) &&
    !cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)
  ) {
    return true;
  }
  return cooperadoGaExibicaoFinanceiraAindaZerada(user);
}

/** Valor a receber comprovado no card ou zero legítimo com fatia local alinhada. */
export function cooperadoGaValorReceberExibicaoResolvida(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return true;
  if (cooperadoFinanceiroCardCacheTemValor(user) || cooperadoHbCreditCacheTemValor(user)) {
    if (cooperadoFinanceiroExibicaoDivergeDoMotorLocal(user)) return false;
    return true;
  }
  if (cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) return false;
  if (cooperadoFinanceiroCardCacheTemValor(user)) return true;
  if (cooperadoGaExibicaoFinanceiraConfiavel(user)) return true;
  if (!isAppDataWarm() || !user.cooperadoId) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (!cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) return false;
  if (cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId)) return false;
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, coopId);
  if (paridade.valorLiquido > 0.01) {
    if (cooperadoPilotMotorCardInicioTemValor(data, cooperadoId, coopId)) return true;
    if (!cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId)) return true;
    return false;
  }
  if (cooperadoOperacionalSyncStale()) return false;
  return cooperadoPilotMotorCardInicioTemValor(data, cooperadoId, coopId) === false;
}

/**
 * Não exibir R$ 0,00 fixo — mostrar “Atualizando…” até sync ou prova de zero.
 */
export function cooperadoGaValorReceberExibicaoIndeterminada(
  user: Omit<User, "password"> | null | undefined,
  display?: InicioCardMotorSnapshot | null
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (display && cooperadoMotorTemObrigacaoReceber(display)) return false;
  if (cooperadoGaValorReceberExibicaoResolvida(user)) return false;
  return true;
}

/** Card/HB ainda sem valor exibível — útil para polling escalonado. */
export function cooperadoGaExibicaoFinanceiraAindaZerada(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  return !cooperadoGaExibicaoFinanceiraConfiavel(user);
}
