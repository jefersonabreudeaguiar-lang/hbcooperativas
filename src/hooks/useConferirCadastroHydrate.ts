"use client";

import { useEffect, useRef } from "react";
import { syncCooperadosFromCloud } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";

function cooperadosAtivosNaCooperativa(coopId: string): number {
  if (!isAppDataWarm()) return 0;
  return getData().cooperados.filter((c) => c.cooperativaId === coopId).length;
}

/**
 * Fila com notas mas cadastro local vazio → nomes caem em "Cooperado".
 * Puxa cooperados da nuvem (bucket) ao abrir Conferir — readonly, sem push.
 */
export function useConferirCadastroHydrate(opts: {
  enabled: boolean;
  coopId?: string;
  filaCount: number;
}): void {
  const { enabled, coopId, filaCount } = opts;
  const inflightRef = useRef(false);
  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!enabled || !coopId || filaCount <= 0) return;
    if (cooperadosAtivosNaCooperativa(coopId) > 0) {
      cooldownRef.current = false;
      return;
    }
    if (inflightRef.current || cooldownRef.current) return;
    if (!isAppDataWarm()) return;
    const cnpj = normalizeCnpj(getCooperativaCnpj(getData(), coopId) ?? "");
    if (cnpj.length !== 14) return;

    inflightRef.current = true;
    const run = () => {
      void syncCooperadosFromCloud(cnpj, coopId).finally(() => {
        inflightRef.current = false;
        cooldownRef.current = true;
      });
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => run(), { timeout: 2500 });
    } else {
      setTimeout(run, 400);
    }
  }, [enabled, coopId, filaCount]);
}
