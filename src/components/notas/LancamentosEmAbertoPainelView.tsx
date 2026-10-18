"use client";

import { useMemo } from "react";
import { StatCard } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatCurrency } from "@/utils/format";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import type { LinhaPagarCooperadoEmAbertoTabela } from "@/services/relatorioService";

export type LinhaTabelaConferir = LinhaPagarCooperadoEmAbertoTabela & {
  situacao: string;
};

export type LancamentosEmAbertoPainelViewProps = {
  linhasTabela: LinhaTabelaConferir[];
  totalGeral: number;
  detalharPorMes: boolean;
  cooperadosCount: number;
};

/** Só apresentação. Não lê lastro, não classifica e não grava financeiro. */
export function LancamentosEmAbertoPainelView({
  linhasTabela,
  totalGeral,
  detalharPorMes,
  cooperadosCount,
}: LancamentosEmAbertoPainelViewProps) {
  const columns = useMemo(
    () => [
      { key: "cooperado", label: "Cooperado" },
      {
        key: "mesesLabel",
        label: detalharPorMes ? "Mês" : "Meses em aberto",
      },
      { key: "entregas", label: "Entregas lançadas" },
      {
        key: "situacao",
        label: "Situação",
        render: (r: LinhaTabelaConferir) => r.situacao || "—",
      },
      {
        key: "total",
        label: "Valor pendente",
        render: (r: { total: number }) => formatCurrency(r.total),
      },
    ],
    [detalharPorMes]
  );

  return (
    <div className="space-y-4">
      <AlertBanner variant="info" title="Saldo em aberto">
        O total é o que ainda falta pagar, inclusive entrega lançada depois de um PIX confirmado. O
        PIX anterior fica no Livro Caixa e não é cobrado de novo — não quita entrega posterior. v{APP_BUILD_VERSION}
      </AlertBanner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title="Cooperados com valor em aberto" value={String(cooperadosCount)} />
        <StatCard title="Total pendente a pagar" value={formatCurrency(totalGeral)} variant="warning" />
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
