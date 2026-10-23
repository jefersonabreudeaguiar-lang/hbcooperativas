"use client";

import { useMemo, useRef } from "react";
import { useAppDataSelectorForDomainsWhenActive } from "@/hooks/useAppData";
import { useResponsavelFilaConferencia } from "@/hooks/useResponsavelFilaConferencia";
import {
  appDataParaConferirLeitura,
  countCooperadosLancamentosEmAbertoResponsavel,
  getRelatorioLancamentosEmAbertoDeLeituraConferir,
} from "@/services/responsavelPainelIndex";
import type { AppData } from "@/types";
import type { LinhaPagarCooperadoEmAberto } from "@/services/relatorioService";

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
  const lastDataRef = useRef<AppData | null>(null);
  if (dataLeituraRaw) lastDataRef.current = dataLeituraRaw;
  const dataLeitura = dataLeituraRaw ?? lastDataRef.current;

  const fila = useResponsavelFilaConferencia(
    coopId,
    isCooperado,
    filaDetalhada,
    panelActive,
    dataLeitura
  );

  const emAbertoComputed = useMemo((): ConferirEmAbertoProjection => {
    if (!staffActive || !coopId || conferirModal || !dataLeitura) return EMPTY_EM_ABERTO;
    if (!precisaLinhasEmAberto) {
      const count = countCooperadosLancamentosEmAbertoResponsavel(dataLeitura, coopId);
      return { linhas: [], count, total: 0 };
    }
    const linhas = getRelatorioLancamentosEmAbertoDeLeituraConferir(
      dataLeitura,
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
    dataLeitura,
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
    dataLeitura,
    ...fila,
    fila,
    emAberto,
    historico: { data: dataLeitura },
    correcoes: { data: dataLeitura },
    totais: {
      fila: fila.filaNavCount,
      emAbertoCount: emAberto.count,
      emAberto: emAberto.total,
    },
    emAbertoCount: emAberto.count,
  };
}
