"use client";

import { formatCurrency, formatMesReferencia } from "@/utils/format";
import type { ReciboResumoInput } from "@/utils/recibo";

export function ReciboResumoView({
  resumo,
  mesReferencia,
  compact = false,
}: {
  resumo: ReciboResumoInput;
  mesReferencia: string;
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

      <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1 border">
        <div className="flex justify-between">
          <span>Total entregas (bruto)</span>
          <span>{formatCurrency(resumo.valorBruto)}</span>
        </div>
        {resumo.descontoCooperativa > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>Desconto cooperativa</span>
            <span>- {formatCurrency(resumo.descontoCooperativa)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Entregas líquidas</span>
          <span>{formatCurrency(resumo.valorEntregas)}</span>
        </div>
        {resumo.descontosExtras.map((d, i) => (
          <div key={i} className="flex justify-between text-red-600">
            <span>{d.motivo}</span>
            <span>- {formatCurrency(d.valor)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-green-700 text-base pt-2 border-t border-gray-200">
          <span>Total recebido</span>
          <span>{formatCurrency(resumo.valorLiquido)}</span>
        </div>
      </div>
    </div>
  );
}
