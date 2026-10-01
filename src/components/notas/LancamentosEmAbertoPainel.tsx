"use client";

import { useMemo } from "react";
import type { AppData } from "@/types";
import { StatCard } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  getRelatorioPagarCooperadoEmAbertoReport,
  getTotalValoresAPagarEmAberto,
} from "@/services/dashboardService";
import { flattenLinhasPagarCooperadoEmAberto } from "@/services/relatorioService";
import { formatCurrency } from "@/utils/format";

type LancamentosEmAbertoPainelProps = {
  data: AppData;
  coopId: string;
  cooperadoId?: string;
};

/** Relatório fixo: entregas já lançadas (conferidas) com pagamento ainda em aberto por cooperado/mês. */
export function LancamentosEmAbertoPainel({ data, coopId, cooperadoId }: LancamentosEmAbertoPainelProps) {
  const { porCooperado, linhasTabela, detalharPorMes, totalGeral } = useMemo(() => {
    const porCooperado = getRelatorioPagarCooperadoEmAbertoReport(data, coopId, cooperadoId);
    const linhasTabela = flattenLinhasPagarCooperadoEmAberto(porCooperado);
    const detalharPorMes = porCooperado.some((r) => r.porMes.length > 1);
    const totalGeral = cooperadoId
      ? porCooperado.reduce((s, r) => s + r.total, 0)
      : getTotalValoresAPagarEmAberto(data, coopId);
    return { porCooperado, linhasTabela, detalharPorMes, totalGeral };
  }, [data, coopId, cooperadoId]);

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
        columns={[
          { key: "cooperado", label: "Cooperado" },
          {
            key: "mesesLabel",
            label: detalharPorMes ? "Mês" : "Meses em aberto",
          },
          { key: "entregas", label: "Entregas lançadas" },
          { key: "total", label: "Valor total", render: (r) => formatCurrency(r.total) },
        ]}
        emptyMessage="Nenhum lançamento em aberto — todos os meses conferidos já foram pagos ou quitados."
      />

      <p className="text-xs text-gray-500">
        Mesma base dos relatórios «A pagar cooperado» e da ficha corrida. Atualiza ao conferir, registrar pagamento
        ou confirmar PIX.
      </p>
    </div>
  );
}
