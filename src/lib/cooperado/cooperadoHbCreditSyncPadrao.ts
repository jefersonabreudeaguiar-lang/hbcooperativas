import type { User } from "@/types";
import { isCloudSessionActive } from "@/lib/security/clientSession";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
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

/** Evita rajadas de sync-limite + operacional (travamento no piloto / PWA). */
const MIN_PIPELINE_INTERVAL_MS = 45_000;

let pipelineInflight: Promise<boolean> | null = null;
let pipelineLastAt = 0;
let pipelineIdleScheduled = false;

/**
 * Pipeline HB Créditos cooperado (produção) — paridade com Conta Coop do responsável:
 * descontos HB na ficha → sync-limite na nuvem (base paridade) → GET /api/credit/account → cache local.
 */
export async function executarCooperadoHbCreditSyncPadrao(
  user: Omit<User, "password"> | null | undefined,
  opts?: { force?: boolean }
): Promise<boolean> {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (!isCloudSessionActive()) return false;

  if (pipelineInflight) return pipelineInflight;

  const now = Date.now();
  if (!opts?.force && pipelineLastAt > 0 && now - pipelineLastAt < MIN_PIPELINE_INTERVAL_MS) {
    return false;
  }

  const cooperadoId = user.cooperadoId;

  pipelineInflight = (async () => {
    pipelineLastAt = Date.now();

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

    const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
    const paridade = cooperadoLeituraFinanceiraExibicao(data, canonico, cooperativaId);
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
  })().finally(() => {
    pipelineInflight = null;
  });

  return pipelineInflight;
}

/** Agenda o pipeline padrão (idle) — login, início, pós-sync operacional. */
export function scheduleCooperadoHbCreditSyncPadrao(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return;
  if (pipelineIdleScheduled) return;
  pipelineIdleScheduled = true;
  const run = () => {
    pipelineIdleScheduled = false;
    void executarCooperadoHbCreditSyncPadrao(user);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_500 });
  } else {
    window.setTimeout(run, 400);
  }
}
