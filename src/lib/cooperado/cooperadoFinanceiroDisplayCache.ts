import type { User } from "@/types";
import {
  cooperadoMotorTemObrigacaoReceber,
  filtrarInicioCardPersistidoLeituraBic,
} from "@/lib/cooperadoInicioCardPolicy";
import {
  inicioCardCacheProntoParaAbertura,
  lerInicioCardPersistidoFlex,
  lerInicioCardPersistidoFlexSemFiltroBuild,
  type InicioCardPersistido,
} from "@/lib/cooperadoInicioCardPersistencia";
import { lerCooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoFinanceiroExibicaoDivergeDeAppDataLive } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";

export function lerInicioCardFinanceiroExibicao(
  cooperadoId: string,
  cooperativaId?: string
): InicioCardPersistido | null {
  const cross = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlexSemFiltroBuild(cooperadoId, cooperativaId)
  );
  if (cross?.display) return cross;
  return filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
  );
}

function financeTenant(user: Omit<User, "password">) {
  if (!user.cooperadoId) return null;
  const data = isAppDataWarm() ? getData() : null;
  const cooperativaId =
    (data ? getUserCooperativaId(user, data) : null) ?? user.cooperativaId;
  if (!cooperativaId) return null;
  const cooperadoId = data
    ? resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId)
    : user.cooperadoId;
  return { cooperadoId, cooperativaId };
}

/** Card “A receber” legível no storage — mesmo build ou cross-build com valor (padrão HB cache). */
/** Cache local do card diverge do motor BIC/AppData — tratar como não resolvido no mobile. */
export function cooperadoFinanceiroExibicaoDivergeDoMotorLocal(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isAppDataWarm()) return false;
  const tenant = financeTenant(user);
  if (!tenant) return false;
  return cooperadoFinanceiroExibicaoDivergeDeAppDataLive(
    getData(),
    tenant.cooperadoId,
    tenant.cooperativaId
  );
}

export function cooperadoFinanceiroCardCacheTemValor(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  const tenant = financeTenant(user);
  if (!tenant) return false;
  const card = lerInicioCardFinanceiroExibicao(tenant.cooperadoId, tenant.cooperativaId);
  return Boolean(card?.display && cooperadoMotorTemObrigacaoReceber(card.display));
}

/** Pode pintar Início/Financeiro antes do sync — card, ficha snapshot ou cache de abertura. */
export function cooperadoFinanceiroExibicaoCachePronto(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  const tenant = financeTenant(user);
  if (!tenant) return false;

  const card = lerInicioCardFinanceiroExibicao(tenant.cooperadoId, tenant.cooperativaId);
  if (card && inicioCardCacheProntoParaAbertura(card)) return true;
  if (card?.display && cooperadoMotorTemObrigacaoReceber(card.display)) return true;

  const ficha = lerCooperadoPwaFichaResumoSnapshot(tenant.cooperadoId, tenant.cooperativaId);
  if (ficha?.paridade && (ficha.paridade.valorLiquido ?? 0) > 0.005) return true;

  return false;
}

export function cooperadoFinanceiroDisplayWarmupEligible(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return Boolean(user && user.role === "cooperado" && isCooperadoMobileGaPromoted(user));
}
