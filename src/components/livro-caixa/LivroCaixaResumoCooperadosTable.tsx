"use client";

import type { ResumoCooperadoLivroCaixaLinha } from "@/services/livroCaixaResumoCooperado";
import { formatCurrency, formatDate } from "@/utils/format";
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
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white space-y-0">
      {linhas.map((r) => {
        const credito = round2(r.creditoTaxa + r.creditoMensalidade + r.creditoOutros);
        const saldo = round2(credito - r.debitoPagamento);
        const entradas = r.entradas ?? [];
        return (
          <div key={r.cooperadoId} className="border-b border-slate-100 last:border-b-0">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_repeat(6,minmax(4.5rem,auto))] gap-2 sm:gap-3 px-3 py-3 bg-slate-50/60 items-center">
              <p className="font-semibold text-slate-900">{r.nome}</p>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Bruto</p>
                <p className="tabular-nums text-slate-900 font-semibold">
                  {r.totalBruto > 0 ? formatCurrency(r.totalBruto) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Taxa coop.</p>
                <p className="tabular-nums text-emerald-700 font-medium">
                  {r.creditoTaxa > 0 ? formatCurrency(r.creditoTaxa) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Mensalidades</p>
                <p className="tabular-nums text-emerald-700 font-medium">
                  {r.creditoMensalidade > 0 ? formatCurrency(r.creditoMensalidade) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Outros desc.</p>
                <p className="tabular-nums text-emerald-700 font-medium">
                  {r.creditoOutros > 0 ? formatCurrency(r.creditoOutros) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">PIX (débito)</p>
                <p className="tabular-nums text-red-700 font-medium">
                  {r.debitoPagamento > 0 ? formatCurrency(r.debitoPagamento) : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500">Saldo</p>
                <p
                  className={`tabular-nums font-semibold ${
                    saldo >= 0 ? "text-slate-900" : "text-red-800"
                  }`}
                >
                  {formatCurrency(saldo)}
                </p>
              </div>
            </div>
            {entradas.length > 0 && (
              <div className="px-3 pb-3">
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-left">
                      <th className="px-2 py-1.5 font-semibold w-[88px]">Data</th>
                      <th className="px-2 py-1.5 font-semibold">Lançamento</th>
                      <th className="px-2 py-1.5 font-semibold text-right w-[90px]">Crédito</th>
                      <th className="px-2 py-1.5 font-semibold text-right w-[90px]">Débito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entradas.map((e, idx) => (
                      <tr key={`${e.dataIso}-${e.origem}-${idx}`} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 tabular-nums whitespace-nowrap text-slate-800">
                          {formatDate(e.dataIso)}
                        </td>
                        <td className="px-2 py-1.5 text-slate-700">
                          <span className="font-medium">{e.origem}</span>
                          {e.historico && e.historico !== e.origem ? (
                            <span className="text-slate-500"> · {e.historico}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                          {e.tipo === "credito" ? formatCurrency(e.valor) : ""}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-red-700">
                          {e.tipo === "debito" ? formatCurrency(e.valor) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
