"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { NotaPedido } from "@/types";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { cn, formatCurrency } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import { contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { calcularTotaisConferenciaItens } from "@/lib/conferencia/conferenciaItensLive";
import { ConferenciaQuantidadeInput } from "@/components/notas/ConferenciaQuantidadeInput";

export type ConferenciaItemRow = {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  quantidade: number;
  precoUnitario?: number;
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
  /** Troca de nota/foto — reinicia rascunho local. */
  conferenciaDraftKey: string;
  conferirErrorsItens?: string;
  onDraftLiveChange: (items: ConferenciaItemRow[]) => void;
  onDraftCommit: (items: ConferenciaItemRow[]) => void;
};

const ConferenciaItemQtyRow = memo(function ConferenciaItemQtyRow({
  item,
  idx,
  disabled,
  onLiveQty,
  onCommitQty,
}: {
  item: ConferenciaItemRow;
  idx: number;
  disabled: boolean;
  onLiveQty: (idx: number, qty: number) => void;
  onCommitQty: (idx: number, qty: number) => void;
}) {
  const onLive = useCallback((qty: number) => onLiveQty(idx, qty), [idx, onLiveQty]);
  const onCommit = useCallback((qty: number) => onCommitQty(idx, qty), [idx, onCommitQty]);

  return (
    <tr
      className={cn(item.quantidade > 0 ? "bg-green-50/50" : "bg-amber-50/30 hover:bg-amber-50/60")}
    >
      <td className="px-4 py-3 font-medium text-gray-900">{item.produtoNome}</td>
      <td className="px-4 py-3">
        <div className="mx-auto w-full max-w-[9rem] text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Digite aqui</p>
          <ConferenciaQuantidadeInput
            value={item.quantidade}
            disabled={disabled}
            ariaLabel={`Quantidade de ${item.produtoNome}`}
            className={qtyInputClassName(
              item.quantidade > 0,
              cn("w-full", disabled && "opacity-70 cursor-not-allowed")
            )}
            onLiveQty={onLive}
            onCommitQty={onCommit}
          />
          <p className="text-[10px] font-medium text-gray-600 mt-1">{labelUnidade(item.unidade)}</p>
        </div>
      </td>
    </tr>
  );
});

export const NotasPedidoConferirItensTable = memo(function NotasPedidoConferirItensTable({
  selectedNota,
  conferenciaInstNome,
  conferenciaFotoSomenteLeitura,
  conferenciaFotoIdx,
  conferenciaDescontoPct,
  conferenciaItens,
  conferenciaDraftKey,
  conferirErrorsItens,
  onDraftLiveChange,
  onDraftCommit,
}: NotasPedidoConferirItensTableProps) {
  const [draft, setDraft] = useState(conferenciaItens);
  const draftKeyRef = useRef(conferenciaDraftKey);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (draftKeyRef.current === conferenciaDraftKey) return;
    draftKeyRef.current = conferenciaDraftKey;
    setDraft(conferenciaItens);
    onDraftLiveChange(conferenciaItens);
  }, [conferenciaDraftKey, conferenciaItens, onDraftLiveChange]);

  const scheduleCommit = useCallback(
    (items: ConferenciaItemRow[]) => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        onDraftCommit(items);
      }, 320);
    },
    [onDraftCommit]
  );

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    []
  );

  const applyQty = useCallback(
    (idx: number, qty: number, commitNow: boolean) => {
      setDraft((prev) => {
        const next = prev.map((item, i) => (i === idx ? { ...item, quantidade: qty } : item));
        onDraftLiveChange(next);
        if (commitNow) {
          if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
          onDraftCommit(next);
        } else {
          scheduleCommit(next);
        }
        return next;
      });
    },
    [onDraftCommit, onDraftLiveChange, scheduleCommit]
  );

  const onLiveQty = useCallback(
    (idx: number, qty: number) => applyQty(idx, qty, false),
    [applyQty]
  );
  const onCommitQty = useCallback(
    (idx: number, qty: number) => applyQty(idx, qty, true),
    [applyQty]
  );

  const conferenciaTotais = useMemo(
    () =>
      calcularTotaisConferenciaItens(
        draft.map((i) => ({ ...i, precoUnitario: i.precoUnitario ?? 0 })),
        conferenciaDescontoPct
      ),
    [draft, conferenciaDescontoPct]
  );

  if (draft.length === 0) {
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
            {draft.map((item, idx) => (
              <ConferenciaItemQtyRow
                key={item.produtoInstituicaoId}
                item={item}
                idx={idx}
                disabled={conferenciaFotoSomenteLeitura}
                onLiveQty={onLiveQty}
                onCommitQty={onCommitQty}
              />
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
});
