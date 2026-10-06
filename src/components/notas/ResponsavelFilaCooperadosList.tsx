"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  contarFotosEnviadasNotas,
  type GrupoConferenciaEntrega,
} from "@/utils/fotoEntrega";

const ROW_HEIGHT_PX = 72;
const OVERSCAN = 4;
/** Só virtualiza listas longas — filas curtas mantêm DOM simples. */
const VIRTUALIZE_MIN_ROWS = 14;
const MAX_LIST_HEIGHT_PX = 28 * 16;

type Props = {
  grupos: GrupoConferenciaEntrega[];
  onSelect: (grupo: GrupoConferenciaEntrega) => void;
  /** Aquece chunks do modal Conferir antes do clique (hover na fila). */
  onRowWarm?: () => void;
};

function FilaCooperadoRow({
  grupo,
  onSelect,
  onRowWarm,
}: {
  grupo: GrupoConferenciaEntrega;
  onSelect: (g: GrupoConferenciaEntrega) => void;
  onRowWarm?: () => void;
}) {
  const qtdNotas = grupo.notas.length;
  const qtdFotos = contarFotosEnviadasNotas(grupo.notas);
  return (
    <button
      type="button"
      onClick={() => onSelect(grupo)}
      onPointerEnter={onRowWarm}
      onFocus={onRowWarm}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-amber-50/80 transition-colors active:bg-amber-100/60"
      style={{ minHeight: ROW_HEIGHT_PX }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900 text-sm font-bold">
        {grupo.nome.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-gray-900 truncate">{grupo.nome}</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {qtdNotas} {qtdNotas === 1 ? "nota" : "notas"}
          {qtdFotos !== qtdNotas ? ` · ${qtdFotos} ${qtdFotos === 1 ? "foto" : "fotos"}` : ""} aguardando
        </span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-1.5 text-amber-800 text-sm font-semibold">
        <span className="min-w-[1.5rem] h-6 px-1.5 rounded-full bg-amber-100 inline-flex items-center justify-center text-xs font-bold">
          {qtdNotas}
        </span>
        <ChevronRight size={18} className="text-gray-400" />
      </span>
    </button>
  );
}

const FilaCooperadoRowMemo = memo(FilaCooperadoRow);

function ResponsavelFilaCooperadosListInner({ grupos, onSelect, onRowWarm }: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const useVirtual = grupos.length >= VIRTUALIZE_MIN_ROWS;
  const listHeight = Math.min(grupos.length * ROW_HEIGHT_PX, MAX_LIST_HEIGHT_PX);

  const slice = useMemo(() => {
    if (!useVirtual) return null;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
    const visible = Math.ceil(listHeight / ROW_HEIGHT_PX) + OVERSCAN * 2;
    const end = Math.min(grupos.length, start + visible);
    return { start, end, offsetY: start * ROW_HEIGHT_PX, totalHeight: grupos.length * ROW_HEIGHT_PX };
  }, [useVirtual, scrollTop, listHeight, grupos.length]);

  if (grupos.length === 0) return null;

  if (!useVirtual) {
    return (
      <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white overflow-hidden">
        {grupos.map((grupo) => (
          <li key={grupo.chave}>
            <FilaCooperadoRowMemo grupo={grupo} onSelect={onSelect} onRowWarm={onRowWarm} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white overflow-y-auto overflow-x-hidden divide-y divide-gray-200"
      style={{ height: listHeight }}
      onScroll={onScroll}
    >
      <div style={{ height: slice!.totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${slice!.offsetY}px)` }}>
          {grupos.slice(slice!.start, slice!.end).map((grupo) => (
            <div key={grupo.chave} className="border-b border-gray-200 last:border-b-0">
              <FilaCooperadoRowMemo grupo={grupo} onSelect={onSelect} onRowWarm={onRowWarm} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const ResponsavelFilaCooperadosList = memo(ResponsavelFilaCooperadosListInner);
