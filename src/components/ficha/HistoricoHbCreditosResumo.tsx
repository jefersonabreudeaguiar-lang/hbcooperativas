"use client";

import { useEffect, useState } from "react";
import { HB_CREDIT_PRODUCT_NAME } from "@/config/hbCreditBranding";
import { fetchHbUtilizacaoResumoCooperado } from "@/services/creditApiService";
import { saldoAReceberBaseAntesHb, type HbUtilizacaoResumoLancamento } from "@/lib/hb-credit/utilizacaoResumo";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";
import type { FichaCorridaDesconto } from "@/types";

function formatDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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

  const compacto = variant === "cooperado";

  if (carregando) {
    return (
      <p
        className={
          compacto ? "text-[11px] text-gray-500" : "text-sm text-gray-500 mt-4 border-t pt-3"
        }
      >
        Carregando {HB_CREDIT_PRODUCT_NAME}…
      </p>
    );
  }

  if (erro) {
    return (
      <p
        className={
          compacto ? "text-[11px] text-amber-700" : "text-sm text-amber-700 mt-4 border-t pt-3"
        }
      >
        {HB_CREDIT_PRODUCT_NAME}: {erro}
      </p>
    );
  }

  if (!lancamentos.length) {
    if (variant === "cooperado") {
      return (
        <p className="text-[11px] text-gray-500">
          Sem compras {HB_CREDIT_PRODUCT_NAME} neste mês.
        </p>
      );
    }
    return null;
  }

  if (compacto) {
    const totalImpacto = lancamentos.reduce((s, l) => s + l.valorImpactoAReceberReais, 0);
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            {HB_CREDIT_PRODUCT_NAME}
          </p>
          <p className="text-[11px] text-gray-600">
            {lancamentos.length} movimento{lancamentos.length === 1 ? "" : "s"} ·{" "}
            <span
              className={cn(
                "font-semibold",
                totalImpacto < 0 ? "text-red-700" : totalImpacto > 0 ? "text-green-700" : "text-gray-700"
              )}
            >
              {totalImpacto >= 0 ? "+ " : "- "}
              {formatCurrency(Math.abs(totalImpacto))}
            </span>
          </p>
        </div>
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-100 bg-gray-50/40">
          {lancamentos.map((l) => {
            const impacto = l.valorImpactoAReceberReais;
            const saida = impacto < 0;
            return (
              <li
                key={l.hbTransactionId}
                className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] leading-tight"
              >
                <span className="min-w-0 truncate text-gray-800" title={l.partnerNome}>
                  {l.partnerNome}
                  <span className="text-gray-400 font-normal"> · {formatDataCurta(l.createdAt)}</span>
                  {l.statusResumo !== "CONFIRMED" && (
                    <span className="text-gray-500 font-normal"> · {statusLabel(l.statusResumo)}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold",
                    saida ? "text-red-700" : impacto > 0 ? "text-green-700" : "text-gray-700"
                  )}
                >
                  {impacto >= 0 ? "+ " : "- "}
                  {formatCurrency(Math.abs(impacto))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <h4 className="text-xs font-semibold text-gray-900">
        {HB_CREDIT_PRODUCT_NAME} — utilização no mês
      </h4>
      <p className="text-xs text-gray-500">
        Lançamentos confirmados na nuvem (mesma base do abatimento do A receber). Autorização pendente não
        aparece até a confirmação do pagamento.
      </p>
      <ul className="space-y-3">
        {lancamentos.map((l) => (
          <li key={l.hbTransactionId} className="rounded-lg border bg-gray-50/80 p-2.5 text-sm space-y-1">
            <div className="flex flex-wrap justify-between gap-2 font-medium text-gray-900">
              <span>{l.partnerNome}</span>
              <span className="text-gray-600">{formatDataHora(l.createdAt)}</span>
            </div>
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
              <span
                className={`text-right font-medium ${
                  l.statusResumo === "CONFIRMED" ? "text-red-700" : "text-green-700"
                }`}
              >
                {l.statusResumo === "CONFIRMED" ? "- " : "+ "}
                {formatCurrency(l.valorHbUtilizadoReais)}
              </span>
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
            {l.statusResumo !== "CONFIRMED" && (
              <p className="text-xs text-gray-600 pt-1">{statusLabel(l.statusResumo)}</p>
            )}
            {l.observacao && <p className="text-xs text-gray-500 pt-1">{l.observacao}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
