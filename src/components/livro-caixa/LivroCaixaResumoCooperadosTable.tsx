"use client";

import type { ResumoCooperadoLivroCaixaLinha } from "@/services/livroCaixaResumoCooperado";
import { formatCurrency } from "@/utils/format";
import { round2 } from "@/utils/calculations";

export function LivroCaixaResumoCooperadosTable({
  linhas,
  emptyMessage = "Nenhum movimento de pagamento ou retenção no período.",
}: {
  linhas: ResumoCooperadoLivroCaixaLinha[];
  emptyMessage?: string;
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-gray-500 py-4">{emptyMessage}</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-slate-100 text-slate-700 text-left">
            <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Cooperado</th>
            <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Taxa coop.</th>
            <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Mensalidades</th>
            <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Pagamento (débito)</th>
            <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((r) => {
            const credito = round2(r.creditoTaxa + r.creditoMensalidade);
            const saldo = round2(credito - r.debitoPagamento);
            return (
              <tr key={r.cooperadoId} className="hover:bg-slate-50/80">
                <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-900">{r.nome}</td>
                <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-emerald-700">
                  {r.creditoTaxa > 0 ? formatCurrency(r.creditoTaxa) : "—"}
                </td>
                <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-emerald-700">
                  {r.creditoMensalidade > 0 ? formatCurrency(r.creditoMensalidade) : "—"}
                </td>
                <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-red-700">
                  {r.debitoPagamento > 0 ? formatCurrency(r.debitoPagamento) : "—"}
                </td>
                <td
                  className={`px-3 py-2 border-b border-slate-100 text-right tabular-nums font-semibold ${
                    saldo >= 0 ? "text-slate-900" : "text-red-800"
                  }`}
                >
                  {formatCurrency(saldo)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
