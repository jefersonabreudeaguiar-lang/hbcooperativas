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
  /** Cooperado: PIX já enviado, falta assinar recibo nesta aba do mês. */
  aguardandoAssinatura?: boolean;
  onAssinarRecibo?: () => void;
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
  aguardandoAssinatura,
  onAssinarRecibo,
}: Props) {
  const resumo = resumoFromPagamento(pagamento);
  const mesesPg = getMesesReferenciaPagamento(pagamento);
  const rotuloPeriodo =
    mesesPg.length > 1 ? formatMesesReferenciaRotulo(mesesPg) : formatMesReferencia(mesReferencia);
  const confirmado = pagamento.status === "confirmado";

  return (
    <div className="space-y-6 mb-6">
      <div
        className={`rounded-2xl p-6 shadow-sm text-white ${
          aguardandoAssinatura
            ? "bg-gradient-to-br from-violet-700 to-violet-800"
            : "bg-gradient-to-br from-green-700 to-green-800"
        }`}
      >
        <div className="flex items-start gap-2 text-sm opacity-90">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <span>
            {aguardandoAssinatura
              ? `PIX registrado · ${rotuloPeriodo} · falta assinar recibo`
              : `Pagamento confirmado · ${rotuloPeriodo}`}
          </span>
        </div>
        <p className="text-sm mt-3 opacity-90">{confirmado ? "Total recebido" : "Valor pago neste mês"}</p>
        <p className="text-3xl sm:text-4xl font-bold mt-1">{formatCurrency(pagamento.valorLiquido)}</p>
        <p className="text-sm mt-3 space-y-0.5 opacity-90">
          {pagamento.pagoEm && (
            <span className="block">Pago pela cooperativa em {formatDate(pagamento.pagoEm.split("T")[0])}</span>
          )}
          {pagamento.assinadoEm && (
            <span className="block">Recibo assinado em {formatDate(pagamento.assinadoEm.split("T")[0])}</span>
          )}
        </p>
        {aguardandoAssinatura && onAssinarRecibo && (
          <Button
            type="button"
            size="lg"
            className="mt-4 bg-white text-violet-900 hover:bg-violet-50"
            onClick={onAssinarRecibo}
          >
            Assinar recibo
          </Button>
        )}
        {!aguardandoAssinatura && onBaixarRecibo && pagamento.reciboHtml && (
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
          rotuloTotal={confirmado ? "Total recebido" : "Total pago (PIX)"}
        />
      </div>

      {cnpj && (
        <div className="rounded-lg border border-gray-100 bg-gray-50/40 px-3 py-2">
          <HistoricoHbCreditosResumo
            cnpj={cnpj}
            cooperadoId={cooperadoId}
            mesReferencia={mesReferencia}
            valorEntregas={resumo.valorEntregas}
            descontosExtras={resumo.descontosExtras}
            variant="cooperado"
            somenteMesReferencia
          />
        </div>
      )}

      {detalheEntregas}
    </div>
  );
}
