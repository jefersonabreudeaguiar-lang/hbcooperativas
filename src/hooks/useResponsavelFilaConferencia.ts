"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { NotaPedido } from "@/types";
import { useAppDataSelectorForDomains } from "@/hooks/useAppData";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { listNotasFilaConferenciaResponsavel } from "@/services/responsavelPainelIndex";
import { getCooperativaCnpj, getPendingNotaDeleteIds } from "@/services/notaPedidoCloudService";
import { agruparPendentesPorCooperado } from "@/utils/fotoEntrega";
import { notaElegivelParaFilaConferenciaResponsavel } from "@/utils/notaStatus";
import { buildPendentesEstaveisConferencia } from "@/utils/filaConferenciaSticky";

/**
 * Fila de conferência do responsável — cálculo pesado (sticky) só quando a aba Conferir está ativa.
 * HX 8.1 — lê AppData via revision (sem prop `data` do pai).
 */
const FILA_CONFERENCIA_DOMAINS: AppDataNotifyDomain[] = ["shell", "notas"];

export function useResponsavelFilaConferencia(
  coopId: string | undefined,
  isCooperado: boolean,
  filaDetalhada: boolean
) {
  const stickyRef = useRef({ ids: new Set<string>(), snapshot: new Map<string, NotaPedido>() });

  const pendingDeleteIds = useAppDataSelectorForDomains(
    FILA_CONFERENCIA_DOMAINS,
    (d) => {
      if (!coopId) return new Set<string>();
      const cnpj = getCooperativaCnpj(d, coopId);
      return cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
    },
    [coopId]
  );

  const pendentesTodasBase =
    useAppDataSelectorForDomains(
      FILA_CONFERENCIA_DOMAINS,
      (d) => {
        if (isCooperado || !coopId || !filaDetalhada) return [] as NotaPedido[];
        return listNotasFilaConferenciaResponsavel(d, coopId);
      },
      [coopId, isCooperado, filaDetalhada]
    ) ?? [];

  const filaBadgeCount =
    useAppDataSelectorForDomains(
      FILA_CONFERENCIA_DOMAINS,
      (d) => {
        if (isCooperado || !coopId || filaDetalhada) return 0;
        const cnpj = getCooperativaCnpj(d, coopId);
        const pending = cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
        const fila = listNotasFilaConferenciaResponsavel(d, coopId);
        if (pending.size === 0) return fila.length;
        let visiveis = 0;
        for (const n of fila) {
          if (!pending.has(n.id)) visiveis += 1;
        }
        return visiveis;
      },
      [coopId, isCooperado, filaDetalhada]
    ) ?? 0;

  const pendentesTodas = useMemo(() => {
    if (!pendingDeleteIds || pendingDeleteIds.size === 0) return pendentesTodasBase;
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
    if (!filaDetalhada || !isAppDataWarm()) return pendentesTodas;
    const data = getData();
    return buildPendentesEstaveisConferencia(
      data,
      pendentesTodas,
      pendingDeleteIds ?? new Set(),
      coopId,
      stickyRef.current
    );
  }, [pendentesTodas, pendingDeleteIds, coopId, filaDetalhada]);

  const pendentesPorCooperado = useMemo(() => {
    if (!filaDetalhada || !isAppDataWarm()) return [];
    const data = getData();
    return agruparPendentesPorCooperado(data, pendentesEstaveis, coopId);
  }, [pendentesEstaveis, coopId, filaDetalhada]);

  const touchNotaNaFilaSticky = useCallback((nota: NotaPedido) => {
    stickyRef.current.ids.add(nota.id);
    stickyRef.current.snapshot.set(nota.id, nota);
  }, []);

  const removerNotaDaFilaSticky = useCallback((notaId: string) => {
    stickyRef.current.ids.delete(notaId);
    stickyRef.current.snapshot.delete(notaId);
  }, []);

  return {
    pendingDeleteIds: pendingDeleteIds ?? new Set<string>(),
    pendentesTodas,
    pendentesEstaveis,
    pendentesPorCooperado,
    filaBadgeCount,
    touchNotaNaFilaSticky,
    removerNotaDaFilaSticky,
  };
}
