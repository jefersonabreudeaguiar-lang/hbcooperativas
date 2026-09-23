import type { AppData } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { findCooperativaByCnpj, normalizeCnpj } from "@/utils/cooperativa";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  clearOperationalDataForCooperativa,
  resetCloudSyncMarkersForRestore,
} from "@/services/operationalReset";
import { getData, saveDataSafe } from "@/services/dataStore";
import { beginCloudSync, endCloudSync } from "@/services/cloudSyncProgress";
import { forceNextFullNotasSync } from "@/services/syncMetaService";
import {
  cloudOperacionalRestoreAtivo,
  syncAllCooperativaFromCloud,
} from "@/services/cooperativaSyncCloudService";

async function fetchOperacionalFromApi(cnpj: string): Promise<OperacionalSyncPayload | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  try {
    const res = await secureApiFetch(`/api/cooperativa-sync?cnpj=${digits}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { operacional?: OperacionalSyncPayload | null };
    return json.operacional ?? null;
  } catch {
    return null;
  }
}

function resolveCoopId(data: AppData, cnpj: string): string | undefined {
  return findCooperativaByCnpj(data, cnpj)?.id;
}

export type OperacionalAlinhamentoStats = {
  cloudResetVersion: number;
  cloudFullReset: boolean;
  localPagamentos: number;
  cloudPagamentos: number;
  localAguardandoAssinatura: number;
  cloudAguardandoAssinatura: number;
  localFichas: number;
  cloudFichas: number;
  desalinhado: boolean;
};

export function medirOperacionalLocalVsNuvem(
  data: AppData,
  coopId: string,
  operacional: OperacionalSyncPayload | null | undefined
): OperacionalAlinhamentoStats {
  const localPag = data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId);
  const cooperadoIds = new Set(data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id));
  const localFichas = data.fichaCorrida.filter(
    (f) => f.cooperativaId === coopId || cooperadoIds.has(f.cooperadoId)
  ).length;
  const cloudPag = operacional?.pagamentosCooperado ?? [];
  const cloudFichas = operacional?.fichaCorrida ?? [];
  const localAguard = localPag.filter((p) => p.status === "aguardando_confirmacao").length;
  const cloudAguard = cloudPag.filter((p) => p.status === "aguardando_confirmacao").length;

  const desalinhado =
    localPag.length !== cloudPag.length ||
    localAguard !== cloudAguard ||
    localFichas !== cloudFichas.length;

  return {
    cloudResetVersion: operacional?.operationalResetVersion ?? 0,
    cloudFullReset: operacional?.fullReset === true,
    localPagamentos: localPag.length,
    cloudPagamentos: cloudPag.length,
    localAguardandoAssinatura: localAguard,
    cloudAguardandoAssinatura: cloudAguard,
    localFichas,
    cloudFichas: cloudFichas.length,
    desalinhado,
  };
}

export type ForceRestoreOperacionalResult = {
  ok: boolean;
  message: string;
  stats: OperacionalAlinhamentoStats;
};

export async function fetchOperacionalViaApi(cnpj: string): Promise<OperacionalSyncPayload | null> {
  return fetchOperacionalFromApi(cnpj);
}

/** Após sync normal: se a nuvem está em restore e o aparelho diverge, força restauração completa. */
export async function ensureOperacionalAlinhadoComNuvem(
  cnpj: string,
  coopId: string
): Promise<ForceRestoreOperacionalResult> {
  const operacional = await fetchOperacionalFromApi(cnpj);
  const stats = medirOperacionalLocalVsNuvem(getData(), coopId, operacional);
  if (!stats.cloudFullReset) {
    return { ok: true, message: "Modo normal (sem restore na nuvem).", stats };
  }
  if (!stats.desalinhado) {
    return { ok: true, message: "Aparelho alinhado ao backup na nuvem.", stats };
  }
  return forceRestoreOperacionalFromCloud(cnpj, coopId);
}

/** Limpa financeiro local da cooperativa e baixa operacional + notas da nuvem (backup publicado). */
export async function forceRestoreOperacionalFromCloud(
  cnpj: string,
  coopId?: string
): Promise<ForceRestoreOperacionalResult> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) {
    return {
      ok: false,
      message: "CNPJ inválido neste aparelho.",
      stats: medirOperacionalLocalVsNuvem(getData(), coopId ?? "", null),
    };
  }

  resetCloudSyncMarkersForRestore(digits);
  forceNextFullNotasSync(digits);

  beginCloudSync();
  try {
    let data = getData();
    const cid = coopId ?? resolveCoopId(data, digits);
    if (!cid) {
      return {
        ok: false,
        message: "Cooperativa não encontrada. Saia e entre de novo.",
        stats: medirOperacionalLocalVsNuvem(data, "", null),
      };
    }

    data = clearOperationalDataForCooperativa(data, cid);
    saveDataSafe(data);

    await syncAllCooperativaFromCloud(digits, cid);

    const operacional = await fetchOperacionalFromApi(digits);
    const stats = medirOperacionalLocalVsNuvem(getData(), cid, operacional);

    if (!cloudOperacionalRestoreAtivo(operacional)) {
      return {
        ok: false,
        message: "A nuvem não está em modo restore. Avise o suporte antes da apresentação.",
        stats,
      };
    }

    if (stats.desalinhado) {
      return {
        ok: false,
        message: `Ainda diferente da nuvem (pagamentos ${stats.localPagamentos}/${stats.cloudPagamentos}, assinaturas ${stats.localAguardandoAssinatura}/${stats.cloudAguardandoAssinatura}). Limpe dados do site e toque de novo.`,
        stats,
      };
    }

    return {
      ok: true,
      message: `Restaurado da nuvem: ${stats.localAguardandoAssinatura} pagamento(s) aguardando assinatura, ${stats.localFichas} lançamentos de ficha.`,
      stats,
    };
  } finally {
    endCloudSync();
  }
}
