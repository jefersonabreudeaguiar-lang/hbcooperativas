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
        const credito = round2(r.creditoTaxa + r.creditoMensalidade);
        const saldo = round2(credito - r.debitoPagamento);
        const pagamentos = r.pagamentos ?? [];
        return (
          <div key={r.cooperadoId} className="border-b border-slate-100 last:border-b-0">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_repeat(4,minmax(5rem,auto))] gap-2 sm:gap-3 px-3 py-3 bg-slate-50/60 items-center">
              <p className="font-semibold text-slate-900">{r.nome}</p>
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
            {pagamentos.length > 0 && (
              <ul className="px-3 pb-3 space-y-2">
                {pagamentos.map((pg) => (
                  <li
                    key={pg.pagamentoId}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        Pagamento · ref. {pg.mesesLabel}
                      </span>
                      <span className="text-xs text-slate-500">
                        {pg.pagoEm ? formatDate(pg.pagoEm.split("T")[0]) : "—"}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-slate-500">Bruto entregas </span>
                        <span className="tabular-nums font-medium">{formatCurrency(pg.valorBruto)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Líquido PIX </span>
                        <span className="tabular-nums font-semibold text-red-700">
                          {formatCurrency(pg.valorLiquido)}
                        </span>
                      </div>
                      {pg.creditoTaxa > 0 && (
                        <div>
                          <span className="text-slate-500">Crédito taxa </span>
                          <span className="tabular-nums text-emerald-700">
                            +{formatCurrency(pg.creditoTaxa)}
                          </span>
                        </div>
                      )}
                      {pg.creditoMensalidade > 0 && (
                        <div>
                          <span className="text-slate-500">Crédito mensalidade </span>
                          <span className="tabular-nums text-emerald-700">
                            +{formatCurrency(pg.creditoMensalidade)}
                          </span>
                        </div>
                      )}
                      {pg.creditoOutros > 0 && (
                        <div>
                          <span className="text-slate-500">Outros créditos </span>
                          <span className="tabular-nums text-emerald-700">
                            +{formatCurrency(pg.creditoOutros)}
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
