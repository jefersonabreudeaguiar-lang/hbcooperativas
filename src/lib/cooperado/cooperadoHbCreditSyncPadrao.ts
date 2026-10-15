import type { User } from "@/types";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { leituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { hbCreditMesPrincipal } from "@/lib/hb-credit/hbCreditLeituraBic";
import { resolveHbCreditLimiteSyncTargets } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { refreshContaCoopValorReceberPilot } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

/**
 * Pipeline HB Créditos cooperado (produção) — paridade com Conta Coop do responsável:
 * descontos HB na ficha → sync-limite na nuvem (base paridade) → GET /api/credit/account → cache local.
 */
export async function executarCooperadoHbCreditSyncPadrao(
  user: Omit<User, "password"> | null | undefined
): Promise<boolean> {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (!isCloudSessionActive()) return false;

  if (!isAppDataWarm()) {
    preloadAppData();
    await waitForAppDataWarm(12_000);
  }
  if (!isAppDataWarm()) return false;

  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data);
  if (!cooperativaId) return false;

  const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
  if (!cnpj) return false;

  const canonico = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  const paridade = leituraFinanceiraParidadeCooperado(data, canonico, cooperativaId);
  const mesReferencia =
    paridade.mesesResumo[paridade.mesesResumo.length - 1] ??
    paridade.mesesResumo[0] ??
    hbCreditMesPrincipal(data, canonico, cooperativaId);

  await refreshContaCoopValorReceberPilot({
    cnpj,
    cooperadoId: canonico,
    mesReferencia,
    cooperativaId,
  }).catch(() => {});

  const limite = resolveHbCreditLimiteSyncTargets(user, data, cooperativaId);
  if (limite) {
    await refreshContaCoopLimiteFromFicha({
      cnpj,
      cooperadoId: limite.apiCooperadoId,
      cooperativaId,
      cooperadoIds: limite.cooperadoIds,
    }).catch(() => {});
  }

  const ok = await persistirHbCreditAccountCooperado(user, { syncLimiteFromFicha: false });
  if (ok) notifyHbCreditAccountCacheUpdated();
  return ok;
}

/** Agenda o pipeline padrão (idle) — login, início, pós-sync operacional. */
export function scheduleCooperadoHbCreditSyncPadrao(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return;
  const run = () => {
    void executarCooperadoHbCreditSyncPadrao(user);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_500 });
  } else {
    window.setTimeout(run, 400);
  }
}
