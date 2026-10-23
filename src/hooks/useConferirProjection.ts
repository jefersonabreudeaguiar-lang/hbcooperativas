"use client";

import { useDeferredValue, useMemo, useRef } from "react";
import { useAppDataSelectorForDomainsWhenActive } from "@/hooks/useAppData";
import { useResponsavelFilaConferencia } from "@/hooks/useResponsavelFilaConferencia";
import {
  appDataParaConferirLeitura,
  countCooperadosLancamentosEmAbertoResponsavel,
  getRelatorioLancamentosEmAbertoDeLeituraConferir,
} from "@/services/responsavelPainelIndex";
import { useConferirCadastroHydrate } from "@/hooks/useConferirCadastroHydrate";
import type { AppData } from "@/types";
import type { LinhaPagarCooperadoEmAberto } from "@/services/relatorioService";

function countCooperadosCooperativa(data: AppData, coopId: string): number {
  return (data.cooperados ?? []).filter((c) => c.cooperativaId === coopId).length;
}

export type ConferirVista = "fila" | "cooperado" | "historico" | "correcoes" | "aberto";

export type ConferirEmAbertoProjection = {
  linhas: LinhaPagarCooperadoEmAberto[];
  count: number;
  total: number;
};

const EMPTY_EM_ABERTO: ConferirEmAbertoProjection = { linhas: [], count: 0, total: 0 };

/**
 * Hub de leitura da aba Conferir — uma leitura compartilhada com a fila (nomes reais).
 */
export function useConferirProjection(opts: {
  coopId: string | undefined;
  vista: ConferirVista;
  panelActive: boolean;
  isCooperado: boolean;
  cooperadoId?: string;
  conferirModal?: boolean;
}) {
  const { coopId, vista, panelActive, isCooperado, cooperadoId, conferirModal } = opts;
  const filaDetalhada = !isCooperado && (vista === "fila" || vista === "cooperado");
  const staffActive = panelActive && !isCooperado;
  const precisaLinhasEmAberto = vista === "aberto";

  const dataLeituraRaw = useAppDataSelectorForDomainsWhenActive(
    staffActive,
    ["shell", "notas", "financeiro"],
    (d) => (coopId ? appDataParaConferirLeitura(d, coopId) : d),
    [coopId]
  );
  const lastCadastroRef = useRef<Pick<AppData, "cooperados" | "users"> | null>(null);
  const dataLeitura = useMemo(() => {
    const raw = dataLeituraRaw;
    if (!raw) return null;
    if (!coopId) return raw;
    const prevCad = lastCadastroRef.current;
    const rawN = countCooperadosCooperativa(raw, coopId);
    const prevN = prevCad ? countCooperadosCooperativa({ ...raw, cooperados: prevCad.cooperados ?? [] }, coopId) : 0;
    if (rawN >= prevN) {
      lastCadastroRef.current = { cooperados: raw.cooperados, users: raw.users };
      return raw;
    }
    if (!prevCad) return raw;
    return appDataParaConferirLeitura(
      {
        ...raw,
        cooperados: prevCad.cooperados ?? raw.cooperados,
        users: prevCad.users ?? raw.users,
      },
      coopId
    );
  }, [dataLeituraRaw, coopId]);
  const lastDataRef = useRef<AppData | null>(null);
  if (dataLeitura) lastDataRef.current = dataLeitura;
  const dataLeituraStable = dataLeitura ?? lastDataRef.current;
  const dataLeituraParaEmAberto = useDeferredValue(dataLeituraStable);

  const fila = useResponsavelFilaConferencia(
    coopId,
    isCooperado,
    filaDetalhada,
    panelActive,
    dataLeituraStable
  );

  useConferirCadastroHydrate({
    enabled: staffActive && filaDetalhada,
    coopId,
    filaCount: fila.filaNavCount,
  });

  const emAbertoComputed = useMemo((): ConferirEmAbertoProjection => {
    if (!staffActive || !coopId || conferirModal || !dataLeituraParaEmAberto) return EMPTY_EM_ABERTO;
    if (!precisaLinhasEmAberto) {
      const count = countCooperadosLancamentosEmAbertoResponsavel(dataLeituraParaEmAberto, coopId);
      return { linhas: [], count, total: 0 };
    }
    const linhas = getRelatorioLancamentosEmAbertoDeLeituraConferir(
      dataLeituraParaEmAberto,
      coopId,
      cooperadoId
    );
    return {
      linhas,
      count: linhas.length,
      total: linhas.reduce((s, l) => s + l.total, 0),
    };
  }, [
    staffActive,
    coopId,
    conferirModal,
    dataLeituraParaEmAberto,
    precisaLinhasEmAberto,
    cooperadoId,
  ]);

  const lastAbertoRef = useRef<ConferirEmAbertoProjection | null>(null);
  if (staffActive && coopId && !conferirModal) {
    if (precisaLinhasEmAberto || emAbertoComputed.count > 0) {
      lastAbertoRef.current = emAbertoComputed;
    } else if (lastAbertoRef.current && emAbertoComputed.count === 0) {
      lastAbertoRef.current = { ...lastAbertoRef.current, count: 0, total: 0, linhas: [] };
    }
  }
  const emAberto = staffActive && coopId && !conferirModal
    ? emAbertoComputed
    : lastAbertoRef.current ?? EMPTY_EM_ABERTO;

  return {
    filaDetalhada,
    dataLeitura: dataLeituraStable,
    ...fila,
    fila,
    emAberto,
    historico: { data: dataLeituraStable },
    correcoes: { data: dataLeituraStable },
    totais: {
      fila: fila.filaNavCount,
      emAbertoCount: emAberto.count,
      emAberto: emAberto.total,
    },
    emAbertoCount: emAberto.count,
  };
}
