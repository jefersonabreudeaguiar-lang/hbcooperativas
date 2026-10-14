"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { EntregaCooperadoView } from "@/services/entregaCooperadoService";

const ROW_HEIGHT_PX = 88;
const OVERSCAN = 3;
const MAX_LIST_HEIGHT_PX = 24 * 16;

type Props = {
  entregas: EntregaCooperadoView[];
  renderItem: (entrega: EntregaCooperadoView) => ReactNode;
};

/** Lista virtualizada de entregas — piloto Jeferson (mês com muitas entregas). */
export function CooperadoEntregasSemanaVirtualList({ entregas, renderItem }: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const listHeight = Math.min(entregas.length * ROW_HEIGHT_PX, MAX_LIST_HEIGHT_PX);

  const slice = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
    const visible = Math.ceil(listHeight / ROW_HEIGHT_PX) + OVERSCAN * 2;
    const end = Math.min(entregas.length, start + visible);
    return { start, end, offsetY: start * ROW_HEIGHT_PX, totalHeight: entregas.length * ROW_HEIGHT_PX };
  }, [scrollTop, listHeight, entregas.length]);

  return (
    <div
      className="space-y-0 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-100"
      style={{ maxHeight: listHeight }}
      onScroll={onScroll}
    >
      <div style={{ height: slice.totalHeight, position: "relative" }}>
        <div className="space-y-3" style={{ transform: `translateY(${slice.offsetY}px)` }}>
          {entregas.slice(slice.start, slice.end).map((entrega) => (
            <div key={entrega.id}>{renderItem(entrega)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
