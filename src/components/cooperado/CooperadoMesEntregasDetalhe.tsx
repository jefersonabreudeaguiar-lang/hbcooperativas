"use client";

import { Package } from "lucide-react";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import {
  agruparEntregasPorSemanaNoMes,
  agruparNotasEmEntregas,
  itensConsolidadosEntrega,
  statusEntregaCooperado,
  valoresEntregaCooperado,
} from "@/services/entregaCooperadoService";
import type { AppData, NotaPedido } from "@/types";
import { formatCurrency, formatDate } from "@/utils/format";

type Props = {
  data: AppData;
  cooperadoId: string;
  mesReferencia: string;
  notas: NotaPedido[];
  getEscolaLabel: (nota: NotaPedido) => string;
};

export function CooperadoMesEntregasDetalhe({
  data,
  cooperadoId,
  mesReferencia,
  notas,
  getEscolaLabel,
}: Props) {
  if (notas.length === 0) {
    return (
      <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center">
        Nenhuma entrega registrada neste mês.
      </p>
    );
  }

  const entregas = agruparNotasEmEntregas(notas);
  const semanas = agruparEntregasPorSemanaNoMes(entregas, mesReferencia);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-semibold text-gray-900">Entregas do mês</h4>
        <p className="text-sm text-gray-500 mt-0.5">
          {entregas.length} entrega{entregas.length !== 1 ? "s" : ""} · escolas e itens por entrega
        </p>
      </div>
      {semanas.map((semana) => (
        <div key={`${mesReferencia}-s${semana.indice}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-2 inline-flex items-center gap-2">
            <Package size={14} />
            {semana.rotulo}
          </p>
          <div className="space-y-2">
            {semana.entregas.map((entrega) => {
              const nota = entrega.notas[0];
              const valores = valoresEntregaCooperado(entrega, data, cooperadoId);
              const itens = itensConsolidadosEntrega(entrega, data, cooperadoId);
              const status = statusEntregaCooperado(entrega);
              return (
                <div key={entrega.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        Entrega {entrega.numeroNoMes} · {getEscolaLabel(nota)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(entrega.dataEntrega)} · Nota {nota.numeroNota}
                        {entrega.qtdFotos > 0 &&
                          ` · ${entrega.qtdFotos} foto${entrega.qtdFotos !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <NotaStatusBadge status={status} />
                      {valores.temValorAprovado && valores.valorLiquido > 0 && (
                        <span className="text-sm font-bold text-green-700">
                          {formatCurrency(valores.valorLiquido)}
                        </span>
                      )}
                    </div>
                  </div>
                  {itens.length > 0 && (
                    <ul className="mt-3 pt-3 border-t border-gray-100 text-sm space-y-1">
                      {itens.map((item) => (
                        <li
                          key={item.produtoInstituicaoId}
                          className="flex justify-between gap-2 text-gray-700"
                        >
                          <span>
                            {item.produtoNome} · {item.quantidade} {item.unidade}
                          </span>
                          {item.valorBruto > 0 && (
                            <span className="font-medium shrink-0">{formatCurrency(item.valorBruto)}</span>
                          )}
                        </li>
                      ))}
                      {valores.temValorAprovado && (
                        <li className="flex justify-between gap-2 font-bold text-green-700 pt-2 border-t border-gray-100">
                          <span>Líquido da entrega</span>
                          <span className="shrink-0">{formatCurrency(valores.valorLiquido)}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
