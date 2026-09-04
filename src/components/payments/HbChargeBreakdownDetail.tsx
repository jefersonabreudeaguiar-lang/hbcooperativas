"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Users, Percent } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatMesReferencia } from "@/utils/format";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";

type Props = {
  breakdown: HbUnifiedChargeBreakdown;
  compact?: boolean;
  showHeader?: boolean;
};

function formatCents(cents: number): string {
  return formatCentsBRL(cents);
}

export function HbChargeBreakdownDetail({ breakdown, compact, showHeader = true }: Props) {
  const [showCooperados, setShowCooperados] = useState(!compact);
  const [showCompras, setShowCompras] = useState(!compact);

  const repasseLabel =
    breakdown.repasseFechamentoLabel ?? formatMesReferencia(breakdown.mesReferenciaContaCoop);

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
          Apurado na nuvem em {new Date(breakdown.generatedAt).toLocaleString("pt-BR")}
        </div>
      )}

      {breakdown.saasDue && (
        <Card className="!p-4 border-emerald-200 bg-emerald-50/40">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 flex items-center gap-1">
                <Users size={14} /> Mensalidade HB · por cooperado
              </p>
              {breakdown.periodoSaas && (
                <p className="text-sm text-gray-700 mt-1">
                  Ciclo desde a adesão · {breakdown.periodoSaas.label} · venc.{" "}
                  {breakdown.periodoSaas.vencimento.split("-").reverse().join("/")}
                </p>
              )}
            </div>
            <p className="text-xl font-bold text-emerald-900 tabular-nums shrink-0">
              {formatCents(breakdown.saasSubtotalCents)}
            </p>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-emerald-50/50"
            onClick={() => setShowCooperados((v) => !v)}
          >
            <span>{breakdown.cooperados.length} cooperado(s) no ciclo</span>
            {showCooperados ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showCooperados && (
            <ul className="mt-2 divide-y divide-emerald-100 rounded-lg border border-emerald-100 bg-white max-h-44 overflow-y-auto text-sm">
              {breakdown.cooperados.map((c) => (
                <li key={c.id} className="px-3 py-2 flex justify-between gap-2">
                  <span className="truncate">{c.nome}</span>
                  <span className="text-gray-600 tabular-nums shrink-0">
                    {formatCents(c.valorUnitarioCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-emerald-900/80">
            Unit. R$ {breakdown.pricing.precoCooperado.toFixed(2).replace(".", ",")} · mín. cooperativa R${" "}
            {breakdown.pricing.minimoMes.toFixed(2).replace(".", ",")}
          </p>
        </Card>
      )}

      {breakdown.repasseDue && (
        <Card className="!p-4 border-blue-200 bg-blue-50/40">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-950 flex items-center gap-1">
                <Percent size={14} /> Conta Coop · {CONTA_COOP_DESCONTO_SPLIT.appPercent}% HB
              </p>
              <p className="text-sm text-gray-700 mt-1">
                Fechamento {repasseLabel} · após saldos dos cooperados quitados
              </p>
            </div>
            <p className="text-xl font-bold text-blue-950 tabular-nums shrink-0">
              {formatCents(breakdown.repasseSubtotalCents)}
            </p>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-between rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-medium text-blue-950 hover:bg-blue-50/50"
            onClick={() => setShowCompras((v) => !v)}
          >
            <span>{breakdown.repasseCompras.length} compra(s) no fechamento</span>
            {showCompras ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showCompras && (
            <ul className="mt-2 divide-y divide-blue-100 rounded-lg border border-blue-100 bg-white max-h-44 overflow-y-auto text-sm">
              {breakdown.repasseCompras.map((row) => (
                <li key={row.allocationId} className="px-3 py-2">
                  <div className="flex justify-between gap-2 font-medium text-gray-900">
                    <span className="truncate">{row.partnerNome}</span>
                    <span className="text-blue-900 tabular-nums shrink-0">{formatCents(row.appCents)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Compra {formatCents(row.grossCents)} · desconto {formatCents(row.discountCents)} ·{" "}
                    {new Date(row.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!breakdown.saasDue && !breakdown.repasseDue && (
        <p
          className={`text-sm ${
            breakdown.repasseAguardandoFechamento || breakdown.statusMessage?.includes("aguarda")
              ? "text-amber-800"
              : "text-green-800"
          }`}
        >
          {breakdown.statusMessage ??
            "Nenhuma cobrança pendente com base nos movimentos reais da nuvem."}
        </p>
      )}

      {breakdown.totalCents > 0 && (
        <div className="flex justify-between items-center rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <span className="text-sm font-medium text-emerald-950">Total a pagar (nuvem)</span>
          <span className="text-lg font-bold text-emerald-900 tabular-nums">
            {formatCents(breakdown.totalCents)}
          </span>
        </div>
      )}
    </div>
  );
}
