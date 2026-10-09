import type { AppData } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";
import { cooperativaTemNotasConferidasSemFichaLocal } from "@/services/fichaSyncGuard";
import { reconciliarFichaFromNotasConferidas } from "@/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "@/services/pagamentoIntegridadeService";

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

/**
 * Projeção financeira in-memory para crédito-base M6 (cliente e servidor).
 * Mesma regra que posProcessarFinanceiroLocal: integridade monotônica de pagamentos;
 * reconcilia ficha×notas quando o operacional não é autoritativo ou há notas conferidas sem ficha local.
 */
export function projetarAppDataFinanceiroParaCreditoBase(data: AppData, cnpj?: string): AppData {
  const digits = resolveCnpjDigits(data, cnpj);
  const coopId = data.cooperativas.find((c) => normalizeCnpj(c.cnpj ?? "") === digits)?.id;
  const operacionalAutoritativo = Boolean(digits && isOperacionalCloudAuthoritative(digits));
  const precisaReconciliarNotas =
    !operacionalAutoritativo ||
    (coopId != null && cooperativaTemNotasConferidasSemFichaLocal(data, coopId));
  const base = precisaReconciliarNotas ? reconciliarFichaFromNotasConferidas(data) : data;
  return posProcessarIntegridadePagamentosCooperativa(base);
}
