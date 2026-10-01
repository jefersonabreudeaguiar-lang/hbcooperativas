"use client";

import { memo, useMemo } from "react";
import { StatCard } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppDataSelector } from "@/hooks/useAppData";
import { getRelatorioLancamentosEmAbertoResponsavel } from "@/services/responsavelPainelIndex";
import {
  flattenLinhasPagarCooperadoEmAberto,
  getTotalValoresAPagarEmAberto,
} from "@/services/relatorioService";
import { formatCurrency } from "@/utils/format";

type LancamentosEmAbertoPainelProps = {
  coopId: string;
  cooperadoId?: string;
};

/** Relatório fixo: entregas já lançadas (conferidas) com pagamento ainda em aberto por cooperado/mês. */
function LancamentosEmAbertoPainelInner({ coopId, cooperadoId }: LancamentosEmAbertoPainelProps) {
  const relatorio = useAppDataSelector(
    (d) => {
      const porCooperado = getRelatorioLancamentosEmAbertoResponsavel(d, coopId, cooperadoId);
      const linhasTabela = flattenLinhasPagarCooperadoEmAberto(porCooperado);
      const detalharPorMes = porCooperado.some((r) => r.porMes.length > 1);
      const totalGeral = cooperadoId
        ? porCooperado.reduce((s, r) => s + r.total, 0)
        : getTotalValoresAPagarEmAberto(d, coopId);
      return { porCooperado, linhasTabela, detalharPorMes, totalGeral };
    },
    [coopId, cooperadoId]
  );

  const { porCooperado, linhasTabela, detalharPorMes, totalGeral } = relatorio ?? {
    porCooperado: [],
    linhasTabela: [],
    detalharPorMes: false,
    totalGeral: 0,
  };

  const columns = useMemo(
    () => [
      { key: "cooperado", label: "Cooperado" },
      {
        key: "mesesLabel",
        label: detalharPorMes ? "Mês" : "Meses em aberto",
      },
      { key: "entregas", label: "Entregas lançadas" },
      { key: "total", label: "Valor total", render: (r: { total: number }) => formatCurrency(r.total) },
    ],
    [detalharPorMes]
  );

  return (
    <div className="space-y-4">
      <AlertBanner variant="info" title="Lançamentos em aberto">
        Entregas já conferidas pelo responsável, com valor a pagar ao cooperado. Ao confirmar o pagamento do mês,
        a linha some daqui; novos lançamentos no mesmo mês voltam a somar automaticamente.
      </AlertBanner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title="Cooperados com valor em aberto" value={String(porCooperado.length)} />
        <StatCard title="Total geral a pagar" value={formatCurrency(totalGeral)} variant="warning" />
      </div>

      <DataTable
        data={linhasTabela}
        keyField="id"
        columns={columns}
        emptyMessage="Nenhum lançamento em aberto — todos os meses conferidos já foram pagos ou quitados."
      />

      <p className="text-xs text-gray-500">
        Mesma base dos relatórios «A pagar cooperado» e da ficha corrida. Atualiza ao conferir, registrar pagamento
        ou confirmar PIX.
      </p>
    </div>
  );
}

export const LancamentosEmAbertoPainel = memo(LancamentosEmAbertoPainelInner);
