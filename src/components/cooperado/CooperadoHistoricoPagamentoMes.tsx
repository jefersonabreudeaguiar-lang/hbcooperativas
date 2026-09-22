"use client";

import type { ReactNode } from "react";
import { CheckCircle2, FileDown } from "lucide-react";
import type { PagamentoCooperadoRegistro } from "@/types";
import { resumoFromPagamento, getMesesReferenciaPagamento } from "@/services/notaPedidoService";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import { HistoricoHbCreditosResumo } from "@/components/ficha/HistoricoHbCreditosResumo";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatMesReferencia, formatMesesReferenciaRotulo } from "@/utils/format";

type Props = {
  pagamento: PagamentoCooperadoRegistro;
  mesReferencia: string;
  descontoPadraoPct: number;
  cnpj: string;
  cooperadoId: string;
  cooperadoNome: string;
  onBaixarRecibo?: () => void;
  detalheEntregas?: ReactNode;
};

export function CooperadoHistoricoPagamentoMes({
  pagamento,
  mesReferencia,
  descontoPadraoPct,
  cnpj,
  cooperadoId,
  cooperadoNome,
  onBaixarRecibo,
  detalheEntregas,
}: Props) {
  const resumo = resumoFromPagamento(pagamento);
  const mesesPg = getMesesReferenciaPagamento(pagamento);
  const rotuloPeriodo =
    mesesPg.length > 1 ? formatMesesReferenciaRotulo(mesesPg) : formatMesReferencia(mesReferencia);

  return (
    <div className="space-y-6 mb-6">
      <div className="bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-2 text-green-100 text-sm">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <span>Pagamento confirmado · {rotuloPeriodo}</span>
        </div>
        <p className="text-green-100 text-sm mt-3">Total recebido</p>
        <p className="text-3xl sm:text-4xl font-bold mt-1">{formatCurrency(pagamento.valorLiquido)}</p>
        <p className="text-green-100/90 text-sm mt-3 space-y-0.5">
          {pagamento.pagoEm && (
            <span className="block">Pago pela cooperativa em {formatDate(pagamento.pagoEm.split("T")[0])}</span>
          )}
          {pagamento.assinadoEm && (
            <span className="block">Recibo assinado em {formatDate(pagamento.assinadoEm.split("T")[0])}</span>
          )}
        </p>
        {onBaixarRecibo && pagamento.reciboHtml && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4 bg-white/15 text-white border-white/30 hover:bg-white/25"
            onClick={onBaixarRecibo}
          >
            <FileDown size={16} /> Baixar recibo
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Resumo do pagamento</h3>
        <p className="text-sm text-gray-500 mb-4">
          Valores que compuseram o PIX de {cooperadoNome.split(" ")[0] ?? "você"} neste período.
        </p>
        <ResumoDescontosMes
          valorBruto={resumo.valorBruto}
          descontoCooperativa={resumo.descontoCooperativa}
          descontoPadraoPct={descontoPadraoPct}
          valorEntregas={resumo.valorEntregas}
          descontosExtras={resumo.descontosExtras}
          totalLiquido={pagamento.valorLiquido}
          rotuloTotal="Total recebido"
        />
      </div>

      {cnpj && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <HistoricoHbCreditosResumo
            cnpj={cnpj}
            cooperadoId={cooperadoId}
            mesReferencia={mesReferencia}
            valorEntregas={resumo.valorEntregas}
            descontosExtras={resumo.descontosExtras}
            variant="cooperado"
          />
        </div>
      )}

      {detalheEntregas}
    </div>
  );
}
