"use client";

import { useEffect, useState } from "react";
import { HB_CREDIT_PRODUCT_NAME } from "@/config/hbCreditBranding";
import { fetchHbUtilizacaoResumoCooperado } from "@/services/creditApiService";
import { saldoAReceberBaseAntesHb, type HbUtilizacaoResumoLancamento } from "@/lib/hb-credit/utilizacaoResumo";
import { formatCurrency } from "@/utils/format";
import type { FichaCorridaDesconto } from "@/types";

function formatDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(s: HbUtilizacaoResumoLancamento["statusResumo"]): string {
  if (s === "CONFIRMED") return "Confirmado";
  if (s === "REVERSED") return "Compra estornada";
  if (s === "REFUND") return "Estorno confirmado";
  return s;
}

type Props = {
  cnpj: string;
  cooperadoId: string;
  mesReferencia: string;
  valorEntregas: number;
  descontosExtras: FichaCorridaDesconto[];
  titularCooperadoIds?: string[];
  /** Vista enxuta na aba de mês pago do cooperado. */
  variant?: "default" | "cooperado";
};

export function HistoricoHbCreditosResumo({
  cnpj,
  cooperadoId,
  mesReferencia,
  valorEntregas,
  descontosExtras,
  titularCooperadoIds,
  variant = "default",
}: Props) {
  const [lancamentos, setLancamentos] = useState<HbUtilizacaoResumoLancamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCarregando(true);
    setErro(null);
    const saldoBase = saldoAReceberBaseAntesHb(valorEntregas, descontosExtras);
    const ids = titularCooperadoIds?.length ? titularCooperadoIds : [cooperadoId];
    fetchHbUtilizacaoResumoCooperado(cnpj, ids, mesReferencia, saldoBase)
      .then((rows) => {
        if (!cancel) setLancamentos(rows);
      })
      .catch((e) => {
        if (!cancel) setErro(e instanceof Error ? e.message : "Erro ao carregar HB Créditos.");
      })
      .finally(() => {
        if (!cancel) setCarregando(false);
      });
    return () => {
      cancel = true;
    };
  }, [cnpj, cooperadoId, mesReferencia, valorEntregas, descontosExtras, titularCooperadoIds]);

  if (carregando) {
    return (
      <p className="text-sm text-gray-500 mt-4 border-t pt-3">
        Carregando histórico {HB_CREDIT_PRODUCT_NAME}…
      </p>
    );
  }

  if (erro) {
    return (
      <p className="text-sm text-amber-700 mt-4 border-t pt-3">
        Histórico {HB_CREDIT_PRODUCT_NAME}: {erro}
      </p>
    );
  }

  if (!lancamentos.length) {
    if (variant === "cooperado") {
      return (
        <p className="text-sm text-gray-500">
          Nenhuma compra com {HB_CREDIT_PRODUCT_NAME} neste mês.
        </p>
      );
    }
    return null;
  }

  const compacto = variant === "cooperado";

  return (
    <div className={compacto ? "space-y-3" : "mt-4 border-t pt-4 space-y-3"}>
      <h4 className="text-sm font-semibold text-gray-900">
        {HB_CREDIT_PRODUCT_NAME} — utilização no mês
      </h4>
      {!compacto && (
        <p className="text-xs text-gray-500">
          Lançamentos confirmados na nuvem (mesma base do abatimento do A receber). Autorização pendente não
          aparece até a confirmação do pagamento.
        </p>
      )}
      {compacto && (
        <p className="text-xs text-gray-500">
          Mesmos lançamentos que o responsável vê no abatimento do pagamento.
        </p>
      )}
      <ul className="space-y-3">
        {lancamentos.map((l) => (
          <li key={l.hbTransactionId} className="rounded-lg border bg-gray-50/80 p-3 text-sm space-y-1">
            <div className="flex flex-wrap justify-between gap-2 font-medium text-gray-900">
              <span>{l.partnerNome}</span>
              <span className="text-gray-600">{formatDataHora(l.createdAt)}</span>
            </div>
            {compacto ? (
              <div className="flex flex-wrap justify-between gap-2 text-gray-700 pt-1">
                <span>Abatido do recebimento</span>
                <span className="font-medium text-red-700">
                  - {formatCurrency(l.valorHbUtilizadoReais || l.valorImpactoAReceberReais)}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
              <span>Compra (bruto)</span>
              <span className="text-right">{formatCurrency(l.valorCompraReais)}</span>
              {l.valorDescontoReais > 0 && (
                <>
                  <span>
                    Desconto mercado
                    {l.descontoMercadoPercent != null ? ` (${l.descontoMercadoPercent}%)` : ""}
                  </span>
                  <span className="text-right">- {formatCurrency(l.valorDescontoReais)}</span>
                </>
              )}
              <span>Valor final negociado</span>
              <span className="text-right">{formatCurrency(l.valorFinalCompraReais)}</span>
              <span>Utilizado em HB</span>
              <span className="text-right">{formatCurrency(l.valorHbUtilizadoReais)}</span>
              <span>Impacto no A receber</span>
              <span
                className={`text-right font-medium ${
                  l.valorImpactoAReceberReais < 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                {l.valorImpactoAReceberReais >= 0 ? "+ " : "- "}
                {formatCurrency(Math.abs(l.valorImpactoAReceberReais))}
              </span>
              {l.saldoAReceberAnteriorReais != null && l.saldoAReceberPosteriorReais != null && (
                <>
                  <span>A receber (antes → depois)</span>
                  <span className="text-right">
                    {formatCurrency(l.saldoAReceberAnteriorReais)} →{" "}
                    {formatCurrency(l.saldoAReceberPosteriorReais)}
                  </span>
                </>
              )}
              <span>Status</span>
              <span className="text-right">{statusLabel(l.statusResumo)}</span>
              {l.receiptCode && (
                <>
                  <span>Comprovante</span>
                  <span className="text-right font-mono text-xs">{l.receiptCode}</span>
                </>
              )}
              <span>Transação HB</span>
              <span className="text-right font-mono text-xs truncate" title={l.hbTransactionId}>
                {l.hbTransactionId}
              </span>
            </div>
            )}
            {!compacto && l.statusResumo !== "CONFIRMED" && (
              <p className="text-xs text-gray-600 pt-1">{statusLabel(l.statusResumo)}</p>
            )}
            {l.observacao && <p className="text-xs text-gray-500 pt-1">{l.observacao}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
