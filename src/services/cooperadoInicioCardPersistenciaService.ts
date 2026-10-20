/**
 * Grava cache do card “A receber” após login, sync ou AppData local — sem abrir o dashboard.
 */
import {
  cooperadoInicioCardAlinharValorFicha,
  cooperadoMotorRevisionOperacional,
  cooperadoMotorTemObrigacaoReceber,
  filtrarInicioCardPersistidoLeituraBic,
  resolverCardInicioEndurecido,
  resolverInicioCardMotorFromAppData,
  sanitizeInicioCardSnapshotParaPersistenciaBic,
} from "@/lib/cooperadoInicioCardPolicy";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoFinanceiroParidadeInicioBridge";
import {
  INICIO_CARD_STORAGE_VERSION,
  gravarInicioCardPersistidoFlex,
  lerInicioCardPersistidoFlex,
  limparInicioCardPersistidoFlex,
} from "@/lib/cooperadoInicioCardPersistencia";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoTemReciboAssinadoLocalSemPendenciaUi } from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { User } from "@/types";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { lerCooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";

export type CooperadoInicioCardPersistUser = Omit<User, "password">;

function resolveTenant(user: CooperadoInicioCardPersistUser): {
  cooperadoId: string;
  cooperativaId: string;
} | null {
  if (user.role !== "cooperado" || !user.cooperadoId) return null;
  if (!isAppDataWarm()) return null;
  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data);
  if (!cooperativaId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  return { cooperadoId, cooperativaId };
}

/** Atualiza localStorage do card a partir do AppData atual (M6 + política endurecida). */
export function persistirInicioCardValorReceberCooperado(
  user: CooperadoInicioCardPersistUser | null | undefined
): boolean {
  if (!user) return false;
  const tenant = resolveTenant(user);
  if (!tenant) return false;

  const { cooperadoId, cooperativaId } = tenant;
  const data = getData();
  const financeiroDesatualizado = cooperadoFinanceiroDesatualizado(data, cooperadoId, cooperativaId);
  if (
    financeiroDesatualizado &&
    !cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, cooperativaId)
  ) {
    return false;
  }
  const persistido = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
  );
  const resolved = resolverCardInicioEndurecido({
    data,
    cooperadoId,
    cooperativaId,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido,
  });

  let display = resolved.display;
  if (!cooperadoMotorTemObrigacaoReceber(display)) {
    const paridade = resolverMotorCardInicioParidadeFinanceiro(data, cooperadoId, cooperativaId);
    if (cooperadoMotorTemObrigacaoReceber(paridade.motor)) {
      display = paridade.motor;
    }
  }
  if (cooperadoTemReciboAssinadoLocalSemPendenciaUi(data, cooperadoId, cooperativaId)) {
    display = {
      ...display,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }

  const paridadeFicha = resolverMotorCardInicioParidadeFinanceiro(data, cooperadoId, cooperativaId);
  const fichaSnap = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  const leitura = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId);
  const temDebitoHb = leitura.descontosExtras.some((d) => d.tipo === "conta_coop");
  const liveValor = paridadeFicha.motor.valor;
  const snapValor = Math.max(
    fichaSnap?.paridade?.valorLiquido ?? 0,
    fichaSnap?.consolidado?.valorLiquido ?? 0
  );
  const valorFicha =
    temDebitoHb && liveValor > 0.005 && liveValor + 0.005 < snapValor
      ? liveValor
      : Math.max(liveValor, snapValor);
  display =
    cooperadoInicioCardAlinharValorFicha(display, valorFicha, paridadeFicha.motor.mesLabel, {
      permitirQuedaPorHb: temDebitoHb && liveValor > 0.005,
    }) ?? display;

  if (!cooperadoMotorTemObrigacaoReceber(display)) {
    return false;
  }

  gravarInicioCardPersistidoFlex(cooperadoId, cooperativaId, {
    v: INICIO_CARD_STORAGE_VERSION,
    appBuild: APP_BUILD_VERSION,
    motorRevision: resolved.latch.motorRevision,
    display: sanitizeInicioCardSnapshotParaPersistenciaBic(display),
    savedAt: new Date().toISOString(),
  });

  return true;
}

/** Leitura rápida só M6 — útil para debug; card usa política completa acima. */
export function lerValorReceberMotorBrutoCooperado(user: CooperadoInicioCardPersistUser | null | undefined): number {
  const tenant = user ? resolveTenant(user) : null;
  if (!tenant) return 0;
  const snap = resolverInicioCardMotorFromAppData(
    getData(),
    tenant.cooperadoId,
    tenant.cooperativaId
  );
  return snap.valor;
}

/** Limpa cache do card após update do app (evita valor antigo no mobile/PWA). */
export function purgarInicioCardValorReceberCooperado(
  user: CooperadoInicioCardPersistUser | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return;
  const data = isAppDataWarm() ? getData() : null;
  const cooperativaId = data ? getUserCooperativaId(user, data) : user.cooperativaId;
  const cooperadoId =
    data && cooperativaId
      ? resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId)
      : user.cooperadoId;
  limparInicioCardPersistidoFlex(cooperadoId, cooperativaId ?? undefined);
}

export function cooperadoInicioCardRevisionAtual(user: CooperadoInicioCardPersistUser | null | undefined): string {
  const tenant = user ? resolveTenant(user) : null;
  if (!tenant) return "";
  return cooperadoMotorRevisionOperacional(getData(), tenant.cooperadoId, tenant.cooperativaId);
}
