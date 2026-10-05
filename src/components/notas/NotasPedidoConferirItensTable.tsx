"use client";

import Link from "next/link";
import type { NotaPedido } from "@/types";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Input } from "@/components/ui/Form";
import { cn, formatCurrency } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import { contarFotosEnviadasNota } from "@/utils/fotoEntrega";

export type ConferenciaItemRow = {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  quantidade: number;
};

function qtyInputClassName(filled: boolean, extra?: string) {
  return cn(
    "min-h-[3.25rem] px-3 py-2 text-center text-2xl font-bold tabular-nums rounded-xl border-2 shadow-sm transition-colors",
    "focus:outline-none focus:ring-4",
    filled
      ? "bg-green-50 border-green-500 text-green-900 placeholder:text-green-400 focus:border-green-600 focus:ring-green-200/80"
      : "bg-amber-50 border-amber-500 text-gray-900 placeholder:text-amber-600 focus:border-amber-600 focus:ring-amber-200/80",
    extra
  );
}

export type NotasPedidoConferirItensTableProps = {
  selectedNota: NotaPedido;
  conferenciaInstNome: string;
  conferenciaFotoSomenteLeitura: boolean;
  conferenciaFotoIdx: number;
  conferenciaDescontoPct: number;
  conferenciaItens: ConferenciaItemRow[];
  conferenciaTotais: { bruto: number; desconto: number; liquido: number };
  conferirErrorsItens?: string;
  onUpdateQty: (idx: number, qty: number) => void;
};

export function NotasPedidoConferirItensTable({
  selectedNota,
  conferenciaInstNome,
  conferenciaFotoSomenteLeitura,
  conferenciaFotoIdx,
  conferenciaDescontoPct,
  conferenciaItens,
  conferenciaTotais,
  conferirErrorsItens,
  onUpdateQty,
}: NotasPedidoConferirItensTableProps) {
  if (conferenciaItens.length === 0) {
    return (
      <AlertBanner variant="warning">
        Este contrato ainda não tem itens.{" "}
        <Link href="/contratos" className="font-semibold underline">
          Cadastrar em Contratos
        </Link>
      </AlertBanner>
    );
  }

  const totalFotos = contarFotosEnviadasNota(selectedNota);
  const fotoLabelIdx = Math.min(conferenciaFotoIdx, Math.max(0, totalFotos - 1));

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="bg-green-700 text-white px-4 py-3">
        <p className="font-semibold">{conferenciaInstNome || "Contrato"}</p>
        <p className="text-green-100 text-xs mt-0.5">
          {conferenciaFotoSomenteLeitura
            ? "Foto já lançada — quantidades bloqueadas"
            : totalFotos > 1
              ? `Foto ${fotoLabelIdx + 1} — informe só o que aparece nesta foto`
              : "Confira a foto ao lado e informe as quantidades entregues"}
        </p>
      </div>
      {conferirErrorsItens && <p className="text-sm text-red-600 px-4 pt-3">{conferirErrorsItens}</p>}
      <div className="overflow-x-auto max-h-[min(50vh,420px)] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-amber-50 border-b-2 border-amber-200 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold text-gray-700">Item</th>
              <th className="text-center px-4 py-2.5 font-bold text-amber-800 w-40">Quantidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {conferenciaItens.map((item, idx) => (
              <tr
                key={item.produtoInstituicaoId}
                className={cn(item.quantidade > 0 ? "bg-green-50/50" : "bg-amber-50/30 hover:bg-amber-50/60")}
              >
                <td className="px-4 py-3 font-medium text-gray-900">{item.produtoNome}</td>
                <td className="px-4 py-3">
                  <div className="mx-auto w-full max-w-[9rem] text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Digite aqui</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      disabled={conferenciaFotoSomenteLeitura}
                      aria-label={`Quantidade de ${item.produtoNome}`}
                      placeholder="0"
                      className={qtyInputClassName(
                        item.quantidade > 0,
                        cn("w-full", conferenciaFotoSomenteLeitura && "opacity-70 cursor-not-allowed")
                      )}
                      value={item.quantidade === 0 ? "" : item.quantidade}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "" || raw === ".") {
                          onUpdateQty(idx, 0);
                          return;
                        }
                        const qty = parseFloat(raw);
                        if (!Number.isNaN(qty)) onUpdateQty(idx, qty);
                      }}
                    />
                    <p className="text-[10px] font-medium text-gray-600 mt-1">{labelUnidade(item.unidade)}</p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span>Total bruto</span>
          <span>{formatCurrency(conferenciaTotais.bruto)}</span>
        </div>
        <div className="flex justify-between text-amber-700">
          <span>Desconto ({conferenciaDescontoPct}%)</span>
          <span>- {formatCurrency(conferenciaTotais.desconto)}</span>
        </div>
        <div className="flex justify-between font-bold text-green-700 text-base pt-1 border-t border-gray-200">
          <span>A receber</span>
          <span>{formatCurrency(conferenciaTotais.liquido)}</span>
        </div>
      </div>
    </div>
  );
}
