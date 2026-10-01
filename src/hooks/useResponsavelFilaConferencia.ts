"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AppData, NotaPedido } from "@/types";
import { useAppDataSelector } from "@/hooks/useAppData";
import { listNotasFilaConferenciaResponsavel } from "@/services/responsavelPainelIndex";
import { getCooperativaCnpj, getPendingNotaDeleteIds } from "@/services/notaPedidoCloudService";
import { agruparPendentesPorCooperado } from "@/utils/fotoEntrega";
import { notaElegivelParaFilaConferenciaResponsavel } from "@/utils/notaStatus";
import { buildPendentesEstaveisConferencia } from "@/utils/filaConferenciaSticky";

/**
 * Fila de conferência do responsável — cálculo pesado (sticky) só quando a aba Conferir está ativa.
 */
export function useResponsavelFilaConferencia(
  coopId: string | undefined,
  isCooperado: boolean,
  filaDetalhada: boolean,
  data: AppData | null
) {
  const stickyRef = useRef({ ids: new Set<string>(), snapshot: new Map<string, NotaPedido>() });

  const pendingDeleteIds = useMemo(() => {
    if (!data || !coopId) return new Set<string>();
    const cnpj = getCooperativaCnpj(data, coopId);
    return cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
  }, [data, coopId]);

  const pendentesTodasBase =
    useAppDataSelector(
      (d) => {
        if (isCooperado || !coopId) return [] as NotaPedido[];
        return listNotasFilaConferenciaResponsavel(d, coopId);
      },
      [coopId, isCooperado]
    ) ?? [];

  const pendentesTodas = useMemo(() => {
    if (pendingDeleteIds.size === 0) return pendentesTodasBase;
    return pendentesTodasBase.filter((n) => !pendingDeleteIds.has(n.id));
  }, [pendentesTodasBase, pendingDeleteIds]);

  useEffect(() => {
    if (!filaDetalhada) return;
    const sticky = stickyRef.current;
    for (const n of pendentesTodas) {
      if (!notaElegivelParaFilaConferenciaResponsavel(n)) continue;
      sticky.ids.add(n.id);
      sticky.snapshot.set(n.id, n);
    }
  }, [pendentesTodas, filaDetalhada]);

  const pendentesEstaveis = useMemo(() => {
    if (!filaDetalhada || !data) return pendentesTodas;
    return buildPendentesEstaveisConferencia(
      data,
      pendentesTodas,
      pendingDeleteIds,
      coopId,
      stickyRef.current
    );
  }, [data, pendentesTodas, pendingDeleteIds, coopId, filaDetalhada]);

  const pendentesPorCooperado = useMemo(() => {
    if (!data || !filaDetalhada) return [];
    return agruparPendentesPorCooperado(data, pendentesEstaveis, coopId);
  }, [data, pendentesEstaveis, coopId, filaDetalhada]);

  const touchNotaNaFilaSticky = useCallback((nota: NotaPedido) => {
    stickyRef.current.ids.add(nota.id);
    stickyRef.current.snapshot.set(nota.id, nota);
  }, []);

  const removerNotaDaFilaSticky = useCallback((notaId: string) => {
    stickyRef.current.ids.delete(notaId);
    stickyRef.current.snapshot.delete(notaId);
  }, []);

  return {
    pendingDeleteIds,
    pendentesTodas,
    pendentesEstaveis,
    pendentesPorCooperado,
    filaBadgeCount: pendentesTodas.length,
    removerNotaDaFilaSticky,
    touchNotaNaFilaSticky,
  };
}
