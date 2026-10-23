"use client";

import { useEffect, useRef } from "react";
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { useAppDataSelectorForDomainsWhenActive } from "@/hooks/useAppData";
import { useResponsavelFilaConferencia } from "@/hooks/useResponsavelFilaConferencia";
import {
  appDataParaConferirLeitura,
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

type ConferirLeituraBundle = {
  leitura: AppData;
  emAberto: ConferirEmAbertoProjection;
};

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

  const bundleRaw = useAppDataSelectorForDomainsWhenActive(
    staffActive,
    ["shell", "notas", "financeiro"],
    (d): ConferirLeituraBundle => {
      if (!coopId) {
        return { leitura: d, emAberto: EMPTY_EM_ABERTO };
      }
      const leitura = appDataParaConferirLeitura(d, coopId);
      if (conferirModal) {
        return { leitura, emAberto: EMPTY_EM_ABERTO };
      }
      const linhas = getRelatorioLancamentosEmAbertoDeLeituraConferir(
        leitura,
        coopId,
        cooperadoId
      );
      const emAberto: ConferirEmAbertoProjection = {
        linhas,
        count: linhas.length,
        total: linhas.reduce((s, l) => s + l.total, 0),
      };
      return { leitura, emAberto };
    },
    [coopId, cooperadoId, conferirModal]
  );

  const lastBundleRef = useRef<ConferirLeituraBundle | null>(null);
  if (bundleRaw) lastBundleRef.current = bundleRaw;
  const bundle = bundleRaw ?? lastBundleRef.current;
  const dataLeitura = bundle?.leitura ?? null;
  const emAberto = bundle?.emAberto ?? EMPTY_EM_ABERTO;

  const lastDataRef = useRef<AppData | null>(null);
  if (dataLeitura) lastDataRef.current = dataLeitura;

  useEffect(() => {
    if (!staffActive || vista !== "aberto" || !coopId) return;
    resetResponsavelPainelIndexCache();
    lastBundleRef.current = null;
  }, [staffActive, vista, coopId]);

  return {
    filaDetalhada,
    dataLeitura: dataLeitura ?? lastDataRef.current,
    ...fila,
    fila,
    emAberto,
    historico: { data: dataLeitura ?? lastDataRef.current },
    correcoes: { data: dataLeitura ?? lastDataRef.current },
    totais: {
      fila: fila.filaNavCount,
      emAbertoCount: emAberto.count,
      emAberto: emAberto.total,
    },
    emAbertoCount: emAberto.count,
  };
}
