"use client";

import { useRef } from "react";
import { useAppDataSelectorForDomainsWhenActive } from "@/hooks/useAppData";
import { useResponsavelFilaConferencia } from "@/hooks/useResponsavelFilaConferencia";
import {
  appDataParaConferirLeitura,
  countCooperadosLancamentosEmAbertoResponsavel,
  getRelatorioLancamentosEmAbertoResponsavel,
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
 * Hub de leitura da aba Conferir: uma foto, uma fila, um lastro.
 * A App só consome — não recalcula listas nem badges.
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

  const fila = useResponsavelFilaConferencia(coopId, isCooperado, filaDetalhada, panelActive);

  const dataLeituraRaw = useAppDataSelectorForDomainsWhenActive(
    staffActive,
    ["shell", "notas", "financeiro"],
    (d) => appDataParaConferirLeitura(d, coopId),
    [coopId]
  );
  const lastDataRef = useRef<AppData | null>(null);
  if (dataLeituraRaw) lastDataRef.current = dataLeituraRaw;
  const dataLeitura = dataLeituraRaw ?? lastDataRef.current;

  const lastAbertoRef = useRef<ConferirEmAbertoProjection | null>(null);
  const precisaLinhasEmAberto = vista === "aberto";
  const precisaBadgeEmAberto =
    vista === "fila" || vista === "cooperado" || vista === "aberto";
  const emAbertoRaw = useAppDataSelectorForDomainsWhenActive(
    staffActive && Boolean(coopId) && !conferirModal && precisaBadgeEmAberto,
    ["financeiro", "notas"],
    (d) => {
      if (!coopId) return EMPTY_EM_ABERTO;
      if (!precisaLinhasEmAberto) {
        const count = countCooperadosLancamentosEmAbertoResponsavel(d, coopId);
        return { linhas: [], count, total: 0 };
      }
      const linhas = getRelatorioLancamentosEmAbertoResponsavel(d, coopId, cooperadoId);
      return {
        linhas,
        count: linhas.length,
        total: linhas.reduce((s, l) => s + l.total, 0),
      };
    },
    [coopId, cooperadoId, precisaLinhasEmAberto]
  );
  if (emAbertoRaw) lastAbertoRef.current = emAbertoRaw;
  const emAberto = emAbertoRaw ?? lastAbertoRef.current ?? EMPTY_EM_ABERTO;

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
