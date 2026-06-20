"use client";

import { formatCurrency, formatMesReferencia } from "@/utils/format";
import type { ReciboResumoInput } from "@/utils/recibo";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";

export function ReciboResumoView({
  resumo,
  mesReferencia,
  descontoPadraoPct = 0,
  compact = false,
}: {
  resumo: ReciboResumoInput;
  mesReferencia: string;
  descontoPadraoPct?: number;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="text-sm text-gray-600">
        {formatMesReferencia(mesReferencia)} · {resumo.entregas} entrega{resumo.entregas !== 1 ? "s" : ""}
      </div>

      {resumo.itens.length > 0 ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-green-700 text-white">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Item</th>
                <th className="text-right px-3 py-2 font-semibold w-24">Qtd</th>
                <th className="text-right px-3 py-2 font-semibold w-28">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resumo.itens.map((i) => (
                <tr key={i.produtoInstituicaoId}>
                  <td className="px-3 py-2 font-medium text-gray-900">{i.produtoNome}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {i.quantidade} {i.unidade}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(i.valorBruto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Entregas do período</p>
      )}

      <ResumoDescontosMes
        valorBruto={resumo.valorBruto}
        descontoCooperativa={resumo.descontoCooperativa}
        descontoPadraoPct={descontoPadraoPct}
        valorEntregas={resumo.valorEntregas}
        descontosExtras={resumo.descontosExtras}
        totalLiquido={resumo.valorLiquido}
        rotuloTotal="Total recebido"
      />
    </div>
  );
}
