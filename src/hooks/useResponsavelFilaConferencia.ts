"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { NotaPedido } from "@/types";
import { useAppDataSelectorForDomainsWhenActive } from "@/hooks/useAppData";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import { getDataOperationalTruth, isAppDataWarm } from "@/services/dataStore";
import { peekStaffGestaoLastGood } from "@/lib/staff/staffGestaoSnapshotGuard";
import {
  isNotaConferenciaDecididaLocalmente,
  reconciliarNotasConferenciaDecididasLocalmente,
} from "@/lib/conferencia/conferenciaFilaDecisaoLocal";
import {
  listNotasFilaConferenciaDeDados,
  listNotasFilaConferenciaResponsavel,
} from "@/services/responsavelPainelIndex";
import { getCooperativaCnpj, getPendingNotaDeleteIds } from "@/services/notaPedidoCloudService";
import { agruparPendentesPorCooperado } from "@/utils/fotoEntrega";
import {
  isNotaSaiuDaFilaConferencia,
  notaElegivelParaFilaConferenciaResponsavel,
} from "@/utils/notaStatus";
import {
  buildPendentesEstaveisConferencia,
  fundirFilaConferirComLastro,
  lastroContagemFila,
} from "@/utils/filaConferenciaSticky";

/**
 * Fila de conferência do responsável — cálculo pesado (sticky) só quando a aba Conferir está ativa.
 * HX 8.1 — lê AppData via revision (sem prop `data` do pai).
 */
const FILA_CONFERENCIA_DOMAINS: AppDataNotifyDomain[] = ["shell", "notas"];

export function useResponsavelFilaConferencia(
  coopId: string | undefined,
  isCooperado: boolean,
  filaDetalhada: boolean,
  panelActive = true
) {
  const subscribeFila = panelActive && !isCooperado;
  const stickyRef = useRef({ ids: new Set<string>(), snapshot: new Map<string, NotaPedido>() });

  const filaSubscribe = subscribeFila && filaDetalhada;
  const badgeSubscribe = subscribeFila && !filaDetalhada;

  const pendingDeleteIds = useAppDataSelectorForDomainsWhenActive(
    filaSubscribe,
    FILA_CONFERENCIA_DOMAINS,
    (d) => {
      if (!coopId) return new Set<string>();
      const cnpj = getCooperativaCnpj(d, coopId);
      return cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
    },
    [coopId]
  );

  const pendentesTodasBase =
    useAppDataSelectorForDomainsWhenActive(
      filaSubscribe,
      FILA_CONFERENCIA_DOMAINS,
      (d) => {
        if (isCooperado || !coopId || !filaDetalhada) return [] as NotaPedido[];
        reconciliarNotasConferenciaDecididasLocalmente(d);
        return listNotasFilaConferenciaResponsavel(d, coopId).filter(
          (n) => !isNotaConferenciaDecididaLocalmente(n.id)
        );
      },
      [coopId, isCooperado, filaDetalhada]
    ) ?? [];

  const filaBadgeCount =
    useAppDataSelectorForDomainsWhenActive(
      badgeSubscribe,
      FILA_CONFERENCIA_DOMAINS,
      (d) => {
        if (isCooperado || !coopId || filaDetalhada) return 0;
        const cnpj = getCooperativaCnpj(d, coopId);
        const pending = cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
        const fila = listNotasFilaConferenciaResponsavel(d, coopId);
        if (pending.size === 0) {
          let visiveis = 0;
          for (const n of fila) {
            if (!isNotaConferenciaDecididaLocalmente(n.id)) visiveis += 1;
          }
          return visiveis;
        }
        let visiveis = 0;
        for (const n of fila) {
          if (isNotaConferenciaDecididaLocalmente(n.id)) continue;
          if (!pending.has(n.id)) visiveis += 1;
        }
        return visiveis;
      },
      [coopId, isCooperado, filaDetalhada]
    ) ?? 0;

  const pendentesTodas = useMemo(() => {
    const base =
      !pendingDeleteIds || pendingDeleteIds.size === 0
        ? pendentesTodasBase
        : pendentesTodasBase.filter((n) => !pendingDeleteIds.has(n.id));
    const lastro = peekStaffGestaoLastGood();
    if (!lastro || !coopId) return base;
    const extra = listNotasFilaConferenciaDeDados(lastro, coopId).filter(
      (n) => !isNotaConferenciaDecididaLocalmente(n.id)
    );
    const truth = isAppDataWarm() ? getDataOperationalTruth() : null;
    const evidencia = {
      notasPedido: [...(truth?.notasPedido ?? []), ...(lastro.notasPedido ?? [])],
      fichaCorrida: [...(truth?.fichaCorrida ?? []), ...(lastro.fichaCorrida ?? [])],
    };
    return fundirFilaConferirComLastro(base, extra, evidencia);
  }, [pendentesTodasBase, pendingDeleteIds, coopId]);

  const lastEstaveisRef = useRef<NotaPedido[]>([]);

  useEffect(() => {
    if (!filaDetalhada || !subscribeFila) return;
    const sticky = stickyRef.current;
    const truth = isAppDataWarm() ? getDataOperationalTruth() : peekStaffGestaoLastGood();
    for (const n of pendentesTodas) {
      if (!notaElegivelParaFilaConferenciaResponsavel(n)) continue;
      const live = truth?.notasPedido.find((x) => x.id === n.id);
      if (live && isNotaSaiuDaFilaConferencia(live.status)) continue;
      sticky.ids.add(n.id);
      sticky.snapshot.set(n.id, n);
    }
  }, [pendentesTodas, filaDetalhada, subscribeFila]);

  const pendentesEstaveis = useMemo(() => {
    if (!filaDetalhada) return lastEstaveisRef.current.length ? lastEstaveisRef.current : pendentesTodas;
    if (!subscribeFila) return lastEstaveisRef.current;
    const data = isAppDataWarm() ? getDataOperationalTruth() : peekStaffGestaoLastGood();
    if (!data) return pendentesTodas.length ? pendentesTodas : lastEstaveisRef.current;
    return buildPendentesEstaveisConferencia(
      data,
      pendentesTodas,
      pendingDeleteIds ?? new Set(),
      coopId,
      stickyRef.current
    );
  }, [pendentesTodas, pendingDeleteIds, coopId, filaDetalhada, subscribeFila]);

  const pendentesPorCooperado = useMemo(() => {
    if (!filaDetalhada) return [];
    const data = isAppDataWarm() ? getDataOperationalTruth() : peekStaffGestaoLastGood();
    if (!data) return [];
    return agruparPendentesPorCooperado(data, pendentesEstaveis, coopId);
  }, [pendentesEstaveis, coopId, filaDetalhada]);

  const lastFilaEstavelCountRef = useRef(0);
  if (filaDetalhada && subscribeFila) {
    lastEstaveisRef.current = pendentesEstaveis;
  }
  if (filaDetalhada) lastFilaEstavelCountRef.current = pendentesEstaveis.length;
  const filaNavCount = filaDetalhada
    ? pendentesEstaveis.length
    : lastroContagemFila(filaBadgeCount, lastFilaEstavelCountRef.current);

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
    filaNavCount,
    touchNotaNaFilaSticky,
    removerNotaDaFilaSticky,
  };
}
