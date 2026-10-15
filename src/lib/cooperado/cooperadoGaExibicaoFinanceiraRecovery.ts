import type { User } from "@/types";
import { cooperadoMotorTemObrigacaoReceber } from "@/lib/cooperadoInicioCardPolicy";
import {
  cooperadoFinanceiroCardCacheTemValor,
  lerInicioCardFinanceiroExibicao,
} from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { cooperadoTemReciboAssinadoLocalSemPendenciaUi } from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
import { lerHbCreditAccountPersistidoFlex } from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { leituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
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
    return true;
  }
  if (!isAppDataWarm() || !user.cooperadoId) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
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
  if (cooperadoAppReleaseNeedsOperacionalSync()) return true;
  if (!isAppDataWarm()) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId || !user.cooperadoId) return false;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId)) return true;
  if (cooperadoPwaFinanceiroSnapshotsAusentes(cooperadoId, coopId)) {
    if (cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)) return true;
    const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, coopId);
    if (paridade.valorLiquido > 0.01) return true;
  }
  const card = lerInicioCardFinanceiroExibicao(cooperadoId, coopId);
  const cardSemValor =
    !card?.display || !cooperadoMotorTemObrigacaoReceber(card.display);
  if (
    cardSemValor &&
    (cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId) ||
      leituraFinanceiraParidadeCooperado(data, cooperadoId, coopId).valorLiquido > 0.01)
  ) {
    return true;
  }
  if (
    cardSemValor &&
    !cooperadoFinanceiroCardCacheTemValor(user) &&
    !cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId)
  ) {
    return true;
  }
  return false;
}

/** Card/HB ainda sem valor exibível — útil para polling escalonado. */
export function cooperadoGaExibicaoFinanceiraAindaZerada(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  return !cooperadoGaExibicaoFinanceiraConfiavel(user);
}
