import type { AppData } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { projetarAppDataFinanceiroParaCreditoBase } from "@/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase";

/** Pós-processamento local: com restore na nuvem, ficha vem do operacional — não recalcular a partir de notas. */
export function posProcessarFinanceiroLocal(data: AppData, cnpj?: string): AppData {
  return projetarAppDataFinanceiroParaCreditoBase(data, cnpj);
}

export function operacionalPagamentosIdsFingerprint(
  pagamentos: { id: string; cooperativaId?: string }[],
  coopId: string
): string {
  return pagamentos
    .filter((p) => p.cooperativaId === coopId)
    .map((p) => p.id)
    .sort()
    .join("\n");
}

export function operacionalLocalDesalinhadoDaNuvem(
  data: AppData,
  coopId: string,
  cloud: Pick<OperacionalSyncPayload, "pagamentosCooperado" | "fichaCorrida" | "fullReset">
): boolean {
  if (!cloud.fullReset) return false;
  const localPag = operacionalPagamentosIdsFingerprint(data.pagamentosCooperado ?? [], coopId);
  const cloudPag = operacionalPagamentosIdsFingerprint(cloud.pagamentosCooperado ?? [], coopId);
  if (localPag !== cloudPag) return true;

  const localFicha = (data.fichaCorrida ?? [])
    .filter((f) => f.cooperativaId === coopId)
    .map((f) => f.id)
    .sort()
    .join("\n");
  const cloudFicha = (cloud.fichaCorrida ?? [])
    .filter((f) => f.cooperativaId === coopId)
    .map((f) => f.id)
    .sort()
    .join("\n");
  return localFicha !== cloudFicha;
}
