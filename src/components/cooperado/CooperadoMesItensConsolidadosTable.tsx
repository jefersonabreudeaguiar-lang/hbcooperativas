"use client";

import { formatCurrency } from "@/utils/format";
import type { agregarItensFichaMes } from "@/services/notaPedidoService";

type Item = ReturnType<typeof agregarItensFichaMes>["itens"][number];

export function CooperadoMesItensConsolidadosTable({
  itens,
  entregas,
  titulo = "Itens do mês (consolidado)",
}: {
  itens: Item[];
  entregas: number;
  titulo?: string;
}) {
  if (itens.length === 0) return null;

  const totalBruto = itens.reduce((s, i) => s + i.valorBruto, 0);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
        {titulo} · {entregas} entrega{entregas !== 1 ? "s" : ""}
      </p>
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-green-700 text-white">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Item</th>
              <th className="text-right px-4 py-2.5 font-semibold w-24">Qtd</th>
              <th className="text-right px-4 py-2.5 font-semibold w-28">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((i) => (
              <tr key={i.produtoInstituicaoId || `${i.produtoNome}-${i.unidade}`}>
                <td className="px-4 py-2.5 font-medium text-gray-900">{i.produtoNome}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">
                  {i.quantidade} {i.unidade}
                </td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(i.valorBruto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-4 py-2.5 font-semibold text-gray-800" colSpan={2}>
                Total bruto dos itens
              </td>
              <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(totalBruto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
