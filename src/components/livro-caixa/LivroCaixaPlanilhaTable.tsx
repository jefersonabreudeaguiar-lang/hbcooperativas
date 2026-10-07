"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { LivroCaixaOrigem, LivroCaixaLancamento } from "@/types";
import { formatCurrency, formatDate } from "@/utils/format";
import {
  formatNumeroSequenciaExibicao,
  isLancamentoManualEditavel,
  isOrigemRetencaoContabil,
} from "@/services/livroCaixaService";
import type { LivroCaixaPlanilhaLinha } from "@/services/livroCaixaPlanilha";

const ORIGEM_LABELS: Record<LivroCaixaOrigem, string> = {
  manual: "Manual",
  mensalidade: "Mensalidade (PIX)",
  mensalidade_ficha: "Mensalidade na ficha",
  taxa_cooperativa: "Taxa cooperativa (5%)",
  desconto_ficha: "Desconto retido na ficha",
  pagamento_cooperado: "Pagamento cooperado",
  credito_avulso: "Crédito avulso",
  debito_avulso: "Débito avulso",
  pnae: "PNAE / contrato",
  prestacao_contas: "Prestação de contas",
  hb_app_repasse: "Repasse HB Créditos",
  outro: "Outro",
};

export interface LivroCaixaPlanilhaTableProps {
  linhas: LivroCaixaPlanilhaLinha[];
  saldoInicial?: number;
  destaqueId?: string | null;
  onEditar?: (l: LivroCaixaLancamento) => void;
  onExcluir?: (l: LivroCaixaLancamento) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  emptyMessage?: string;
}

export function LivroCaixaPlanilhaTable({
  linhas,
  saldoInicial = 0,
  destaqueId,
  onEditar,
  onExcluir,
  canEdit,
  canDelete,
  emptyMessage = "Nenhum lançamento no período.",
}: LivroCaixaPlanilhaTableProps) {
  const mostrarSaldoAnterior = Math.abs(saldoInicial) > 0.0001;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 text-left">
              <th className="px-3 py-2.5 font-semibold border-b border-slate-200 w-12 text-center">Nº</th>
              <th className="px-3 py-2.5 font-semibold border-b border-slate-200 w-[100px]">Data</th>
              <th className="px-3 py-2.5 font-semibold border-b border-slate-200 min-w-[220px]">Histórico</th>
              <th className="px-3 py-2.5 font-semibold border-b border-slate-200 w-[110px] text-right">Crédito</th>
              <th className="px-3 py-2.5 font-semibold border-b border-slate-200 w-[110px] text-right">Débito</th>
              <th className="px-3 py-2.5 font-semibold border-b border-slate-200 w-[120px] text-right">Saldo</th>
              {(canEdit || canDelete) && (
                <th className="px-2 py-2.5 font-semibold border-b border-slate-200 w-20" aria-label="Ações" />
              )}
            </tr>
          </thead>
          <tbody>
            {mostrarSaldoAnterior && (
              <tr className="bg-slate-50/90 text-slate-600 italic">
                <td className="px-3 py-2 border-b border-slate-100" colSpan={3}>Saldo anterior</td>
                <td className="px-3 py-2 border-b border-slate-100" />
                <td className="px-3 py-2 border-b border-slate-100" />
                <td className="px-3 py-2 border-b border-slate-100 text-right font-semibold tabular-nums">
                  {formatCurrency(saldoInicial)}
                </td>
                {(canEdit || canDelete) && <td className="border-b border-slate-100" />}
              </tr>
            )}
            {linhas.map(({ lancamento: l, credito, debito, saldoCorrido }) => {
              const retencao = isOrigemRetencaoContabil(l.origem);
              const destacado = destaqueId === l.id;
              return (
                <tr
                  key={l.id}
                  id={`lc-row-${l.id}`}
                  className={`group hover:bg-slate-50/80 ${
                    destacado ? "ring-2 ring-inset ring-amber-400 bg-amber-50/40" : ""
                  } ${retencao ? "bg-blue-50/30" : ""}`}
                >
                  <td className="px-3 py-2 border-b border-slate-100 text-center font-mono text-xs text-slate-600">
                    {formatNumeroSequenciaExibicao(l.numeroSequencia)}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap tabular-nums text-slate-800">
                    {formatDate(l.data)}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100">
                    <p className="font-medium text-slate-900 leading-snug">{l.historico}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ORIGEM_LABELS[l.origem]}
                      {retencao ? " · retenção (ficha)" : ""}
                      {l.responsavel ? ` · ${l.responsavel}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-emerald-700 font-medium">
                    {credito != null ? formatCurrency(credito) : ""}
                  </td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right tabular-nums text-red-700 font-medium">
                    {debito != null ? formatCurrency(debito) : ""}
                  </td>
                  <td
                    className={`px-3 py-2 border-b border-slate-100 text-right tabular-nums font-semibold ${
                      saldoCorrido >= 0 ? "text-slate-900" : "text-red-800"
                    }`}
                  >
                    {formatCurrency(saldoCorrido)}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-1 py-1 border-b border-slate-100">
                      <div className="flex justify-end gap-0.5 opacity-80 group-hover:opacity-100">
                        {canEdit && isLancamentoManualEditavel(l) && onEditar && (
                          <button
                            type="button"
                            onClick={() => onEditar(l)}
                            className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && isLancamentoManualEditavel(l) && onExcluir && (
                          <button
                            type="button"
                            onClick={() => onExcluir(l)}
                            className="p-1.5 rounded-md hover:bg-red-50 text-red-600"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {linhas.length === 0 && !mostrarSaldoAnterior && (
        <p className="text-center text-slate-500 py-10 text-sm">{emptyMessage}</p>
      )}
    </div>
  );
}
