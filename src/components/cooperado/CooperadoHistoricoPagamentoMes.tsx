"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, FileDown } from "lucide-react";
import { HB_CREDIT_PRODUCT_NAME } from "@/config/hbCreditBranding";
import type { PagamentoCooperadoRegistro } from "@/types";
import { resumoFromPagamento, getMesesReferenciaPagamento } from "@/services/notaPedidoService";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import { HistoricoHbCreditosResumo } from "@/components/ficha/HistoricoHbCreditosResumo";
import { Button } from "@/components/ui/Button";
import { cn, formatCurrency, formatDate, formatMesReferencia, formatMesesReferenciaRotulo } from "@/utils/format";

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
  const [hbAberto, setHbAberto] = useState(false);
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
        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setHbAberto((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            aria-expanded={hbAberto}
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">{HB_CREDIT_PRODUCT_NAME}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {hbAberto ? "Resumo das compras no mês" : "Toque para ver o resumo das compras"}
              </p>
            </div>
            <ChevronDown
              size={18}
              className={cn("text-gray-400 shrink-0 transition-transform", hbAberto && "rotate-180")}
            />
          </button>
          {hbAberto && (
            <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/40">
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
        </section>
      )}

      {detalheEntregas}
    </div>
  );
}
