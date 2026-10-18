"use client";

import { memo, useRef } from "react";
import { useAppDataSelector } from "@/hooks/useAppData";
import {
  montarRelatorioEmAbertoConferir,
  origemLinhaEmAbertoConferir,
} from "@/components/notas/montarRelatorioEmAbertoConferir";
import { LancamentosEmAbertoPainelView } from "@/components/notas/LancamentosEmAbertoPainelView";

export { origemLinhaEmAbertoConferir };

type LancamentosEmAbertoPainelProps = {
  coopId: string;
  cooperadoId?: string;
};

/** Relatório fixo: entregas já lançadas (conferidas) com pagamento ainda em aberto por cooperado/mês. */
function LancamentosEmAbertoPainelInner({ coopId, cooperadoId }: LancamentosEmAbertoPainelProps) {
  const relatorio = useAppDataSelector(
    (d) => montarRelatorioEmAbertoConferir(d, coopId, cooperadoId),
    [coopId, cooperadoId]
  );

  const lastRelatorioRef = useRef(relatorio);
  if (relatorio) lastRelatorioRef.current = relatorio;

  const { porCooperado, linhasTabela, detalharPorMes, totalGeral } = relatorio ??
    lastRelatorioRef.current ?? {
      porCooperado: [],
      linhasTabela: [],
      detalharPorMes: false,
      totalGeral: 0,
    };

  return (
    <LancamentosEmAbertoPainelView
      linhasTabela={linhasTabela}
      totalGeral={totalGeral}
      detalharPorMes={detalharPorMes}
      cooperadosCount={porCooperado.length}
    />
  );
}

export const LancamentosEmAbertoPainel = memo(LancamentosEmAbertoPainelInner);
