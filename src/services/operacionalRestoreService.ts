import type { AppData } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { findCooperativaByCnpj, normalizeCnpj } from "@/utils/cooperativa";
import { secureApiFetch } from "@/lib/security/clientSession";
import { syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
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

function contarFatiaOperacionalLocal(data: AppData, coopId: string) {
  const s = medirOperacionalLocalVsNuvem(data, coopId, null);
  return {
    pagamentos: s.localPagamentos,
    aguardando: s.localAguardandoAssinatura,
    fichas: s.localFichas,
  };
}

/** Restore da nuvem não pode apagar pagamento/ficha/assinatura que já estava no aparelho. */
export function operacionalRestoreRetrocedeu(
  before: AppData,
  after: AppData,
  coopId: string
): boolean {
  const b = contarFatiaOperacionalLocal(before, coopId);
  const a = contarFatiaOperacionalLocal(after, coopId);
  return a.pagamentos < b.pagamentos || a.fichas < b.fichas || a.aguardando < b.aguardando;
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
  // Não restaurar automaticamente a cada sync — evita apagar/repuxar em loop (use o painel no Início).
  return {
    ok: true,
    message: "Backup na nuvem diverge do aparelho — use «Restaurar da nuvem» no Início se necessário.",
    stats,
  };
}

/** Puxa o backup da nuvem sem zerar o aparelho antes — se a aplicação apagar lastro, desfaz. */
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

  const before = getData();
  const cid = coopId ?? resolveCoopId(before, digits);
  if (!cid) {
    return {
      ok: false,
      message: "Cooperativa não encontrada. Saia e entre de novo.",
      stats: medirOperacionalLocalVsNuvem(before, "", null),
    };
  }

  const cloudHint = await fetchOperacionalFromApi(digits);
  if (!cloudOperacionalRestoreAtivo(cloudHint)) {
    return {
      ok: false,
      message: "A nuvem não está em modo restore. Avise o suporte antes da apresentação.",
      stats: medirOperacionalLocalVsNuvem(before, cid, cloudHint),
    };
  }

  forceNextFullNotasSync(digits);

  beginCloudSync();
  try {
    await syncAllCooperativaFromCloud(digits, cid);
    await syncNotasPedidoFromCloud(digits, { retryFull: true });

    const after = getData();
    const operacional = await fetchOperacionalFromApi(digits);

    if (operacionalRestoreRetrocedeu(before, after, cid)) {
      saveDataSafe(before);
      return {
        ok: false,
        message: "A nuvem não foi aplicada porque apagaria o que já está neste aparelho.",
        stats: medirOperacionalLocalVsNuvem(before, cid, operacional),
      };
    }

    const stats = medirOperacionalLocalVsNuvem(getData(), cid, operacional);
    if (stats.desalinhado) {
      return {
        ok: false,
        message: `Ainda diferente da nuvem (pagamentos ${stats.localPagamentos}/${stats.cloudPagamentos}, assinaturas ${stats.localAguardandoAssinatura}/${stats.cloudAguardandoAssinatura}).`,
        stats,
      };
    }

    return {
      ok: true,
      message: `Restaurado da nuvem: ${stats.localPagamentos} pagamento(s), ${stats.localFichas} lançamentos de ficha.`,
      stats,
    };
  } finally {
    endCloudSync();
  }
}
