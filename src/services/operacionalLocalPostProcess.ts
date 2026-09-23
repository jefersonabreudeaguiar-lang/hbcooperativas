import type { AppData } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { normalizeCnpj } from "@/utils/cooperativa";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "@/services/pagamentoIntegridadeService";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";

function resolveCnpjDigits(data: AppData, cnpj?: string): string {
  if (cnpj) {
    const d = normalizeCnpj(cnpj);
    if (d.length === 14) return d;
  }
  return (
    data.cooperativas
      .map((c) => normalizeCnpj(c.cnpj ?? ""))
      .find((d) => d.length === 14) ?? ""
  );
}

/** Pós-processamento local: com restore na nuvem, ficha vem do operacional — não recalcular a partir de notas. */
export function posProcessarFinanceiroLocal(data: AppData, cnpj?: string): AppData {
  const digits = resolveCnpjDigits(data, cnpj);
  if (digits && isOperacionalCloudAuthoritative(digits)) {
    return posProcessarIntegridadePagamentosCooperativa(data);
  }
  return posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));
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
