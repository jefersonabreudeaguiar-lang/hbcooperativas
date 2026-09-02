"use client";

import { DataTable } from "@/components/ui/Table";
import type { RelatorioEntregasPorItensPeriodo } from "@/services/relatorioService";
import { formatCurrency } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";

interface EntregasPorItensPainelProps {
  relatorio: RelatorioEntregasPorItensPeriodo;
}

export function EntregasPorItensPainel({ relatorio: r }: EntregasPorItensPainelProps) {
  return (
    <>
      <div
        className={`mb-4 rounded-xl border p-4 ${
          r.apenasPendente ? "border-amber-200 bg-amber-50/60" : "border-green-200 bg-green-50/60"
        }`}
      >
        <p className={`text-sm font-semibold ${r.apenasPendente ? "text-amber-950" : "text-green-900"}`}>
          {r.instituicaoNome}
        </p>
        <p className={`text-xs mt-1 ${r.apenasPendente ? "text-amber-900" : "text-green-800"}`}>
          Período: {r.mesesLabel} · {r.quantidadeEntregas} entrega(s) pendente(s) ·{" "}
          {r.apenasPendente ? "Total em aberto: " : "Total: "}
          {formatCurrency(r.totalBruto)}
        </p>
        {r.apenasPendente && (
          <p className="text-xs text-amber-800 mt-2">
            Consolidado por item — somente fichas pendentes de pagamento nos meses selecionados (ex.: agosto e
            setembro).
          </p>
        )}
      </div>

      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-3">Consolidado por item</h3>
      <DataTable
        data={r.itens.map((item, idx) => ({
          ...item,
          id: item.produtoInstituicaoId || `${item.produtoNome}-${idx}`,
        }))}
        keyField="id"
        emptyMessage="Nenhum item pendente no período para esta instituição."
        columns={[
          { key: "produto", label: "Item", render: (item) => item.produtoNome },
          {
            key: "unidade",
            label: "Unidade",
            render: (item) => labelUnidade(item.unidade) || item.unidade,
          },
          {
            key: "quantidade",
            label: "Quantidade",
            render: (item) =>
              `${item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${labelUnidade(item.unidade) || item.unidade}`,
          },
          { key: "preco", label: "Preço médio", render: (item) => formatCurrency(item.precoUnitario) },
          { key: "total", label: "Valor total", render: (item) => formatCurrency(item.valorTotal) },
        ]}
      />
    </>
  );
}
