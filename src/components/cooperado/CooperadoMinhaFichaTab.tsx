"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileDown,
  Package,
  PenLine,
  Wallet,
} from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Button } from "@/components/ui/Button";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import {
  agregarItensFichaMes,
  getResumoPagamentoExibicao,
} from "@/services/notaPedidoService";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  agruparEntregasPorSemanaNoMes,
  agruparNotasEmEntregas,
  itensConsolidadosEntrega,
  statusEntregaCooperado,
  valoresEntregaCooperado,
} from "@/services/entregaCooperadoService";
import { ValoresAvulsosReceberPanel } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { totalValoresAvulsosPendentes } from "@/services/valoresAvulsosReceberService";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";
import { baixarRecibo, nomeArquivoRecibo } from "@/utils/recibo";

interface CooperadoMinhaFichaTabProps {
  cooperadoId: string;
  cooperativaId?: string;
  nomeCooperado: string;
  resumos: ResumoMesEntregasCooperado[];
  getEscolaLabel: (nota: import("@/types").NotaPedido) => string;
}

function MesFichaAccordion({
  resumo,
  cooperadoId,
  cooperativaId,
  nomeCooperado,
  getEscolaLabel,
  expandido,
  onToggle,
}: {
  resumo: ResumoMesEntregasCooperado;
  cooperadoId: string;
  cooperativaId?: string;
  nomeCooperado: string;
  getEscolaLabel: CooperadoMinhaFichaTabProps["getEscolaLabel"];
  expandido: boolean;
  onToggle: () => void;
}) {
  const data = useAppData();
  const resumoPagamento = useMemo(() => {
    if (!data) return null;
    return getResumoPagamentoExibicao(data, cooperadoId, resumo.mesReferencia, cooperativaId);
  }, [data, cooperadoId, resumo.mesReferencia, cooperativaId]);

  const itensMes = useMemo(() => {
    if (!data) return { itens: [], entregas: 0, valorBruto: 0 };
    return agregarItensFichaMes(data, cooperadoId, resumo.mesReferencia, cooperativaId);
  }, [data, cooperadoId, resumo.mesReferencia, cooperativaId]);

  const avulsosPendentes = useMemo(() => {
    if (!data) return 0;
    return totalValoresAvulsosPendentes(data, cooperadoId, resumo.mesReferencia, cooperativaId);
  }, [data, cooperadoId, resumo.mesReferencia, cooperativaId]);

  if (!data || !resumoPagamento) return null;

  const quitado = !!resumo.pagamentoConfirmado;
  const aguardando = !!resumo.pagamentoAguardando;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-gray-50/80 transition-colors"
      >
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
            quitado ? "bg-emerald-100 text-emerald-800" : aguardando ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
          )}
        >
          {quitado ? <CheckCircle2 size={22} /> : <Wallet size={22} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">{formatMesReferencia(resumo.mesReferencia)}</p>
          <p className="text-sm text-gray-600 mt-0.5">
            {resumo.quantidadeEntregas} entrega{resumo.quantidadeEntregas !== 1 ? "s" : ""}
            {quitado && ` · recebido ${formatCurrency(resumo.valorRecebido)}`}
            {!quitado && resumo.valorAReceber > 0 && ` · a receber ${formatCurrency(resumo.valorAReceber)}`}
          </p>
        </div>
        {expandido ? <ChevronDown size={20} className="text-gray-400 shrink-0" /> : <ChevronRight size={20} className="text-gray-400 shrink-0" />}
      </button>

      {expandido && (
        <div className="border-t border-gray-100 px-4 sm:px-5 pb-5 pt-4 space-y-5 bg-gray-50/40">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Entregas</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{resumo.quantidadeEntregas}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Bruto</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(resumoPagamento.valorBruto)}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Recebido</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                {quitado ? formatCurrency(resumo.valorRecebido) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Situação</p>
              <p className="text-sm font-bold mt-1.5">
                {quitado ? (
                  <span className="text-emerald-700">Quitado</span>
                ) : aguardando ? (
                  <span className="text-amber-700">Aguardando assinatura</span>
                ) : resumo.valorAReceber > 0 ? (
                  <span className="text-green-700">A receber</span>
                ) : (
                  <span className="text-gray-600">Em conferência</span>
                )}
              </p>
            </div>
          </div>

          {(resumoPagamento.valorBruto > 0 || resumo.valorAReceber > 0 || quitado) && (
            <div className="rounded-xl overflow-hidden">
              <ResumoDescontosMes
                valorBruto={resumoPagamento.valorBruto}
                descontoCooperativa={resumoPagamento.descontoCooperativa}
                descontoPadraoPct={data.config.descontoPadraoCooperativa}
                valorEntregas={resumoPagamento.valorEntregas}
                descontosExtras={resumoPagamento.descontosExtras}
                totalLiquido={quitado ? resumo.valorRecebido : resumoPagamento.valorLiquido}
                rotuloTotal={quitado ? "Total recebido" : "Total líquido"}
              />
            </div>
          )}

          {avulsosPendentes > 0 && (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              Inclui {formatCurrency(avulsosPendentes)} em valores avulsos a receber neste mês.
            </p>
          )}

          {resumo.notas.length > 0 && (() => {
            const entregas = agruparNotasEmEntregas(resumo.notas);
            const semanas = agruparEntregasPorSemanaNoMes(entregas, resumo.mesReferencia);
            return (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Entregas do mês · {entregas.length} {entregas.length === 1 ? "entrega" : "entregas"}
              </p>
              <div className="space-y-4">
                {semanas.map((semana) => (
                  <div key={`${resumo.mesReferencia}-s${semana.indice}`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-2 inline-flex items-center gap-2">
                      <Package size={14} />
                      {semana.rotulo}
                    </p>
                    <div className="space-y-2">
                      {semana.entregas.map((entrega) => {
                        const nota = entrega.notas[0];
                        const valores = valoresEntregaCooperado(entrega, data, cooperadoId);
                        const itens = itensConsolidadosEntrega(entrega);
                        const status = statusEntregaCooperado(entrega);
                        return (
                          <div key={entrega.id} className="rounded-xl border border-gray-200 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-gray-900">
                                  Entrega {entrega.numeroNoMes} · {getEscolaLabel(nota)}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {formatDate(entrega.dataEntrega)} · {nota.numeroNota}
                                  {entrega.qtdFotos > 0 && ` · ${entrega.qtdFotos} foto${entrega.qtdFotos !== 1 ? "s" : ""}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <NotaStatusBadge status={status} />
                                {valores.temValorAprovado && valores.valorLiquido > 0 && (
                                  <span className="text-sm font-bold text-green-700">{formatCurrency(valores.valorLiquido)}</span>
                                )}
                              </div>
                            </div>
                            {itens.length > 0 && (
                              <ul className="mt-3 pt-3 border-t border-gray-100 text-sm space-y-1">
                                {itens.map((item) => (
                                  <li key={item.produtoInstituicaoId} className="flex justify-between gap-2 text-gray-700">
                                    <span>
                                      {item.produtoNome} · {item.quantidade} {item.unidade}
                                    </span>
                                    {item.valorBruto > 0 && (
                                      <span className="font-medium shrink-0">{formatCurrency(item.valorBruto)}</span>
                                    )}
                                  </li>
                                ))}
                                {valores.temValorAprovado && (
                                  <li className="flex justify-between gap-2 text-gray-700 pt-2 border-t border-gray-100">
                                    <span className="font-medium">Total bruto</span>
                                    <span className="font-medium shrink-0">{formatCurrency(valores.valorBruto)}</span>
                                  </li>
                                )}
                                {valores.valorDesconto > 0 && (
                                  <li className="flex justify-between gap-2 text-amber-700">
                                    <span>Desconto cooperativa</span>
                                    <span className="shrink-0">- {formatCurrency(valores.valorDesconto)}</span>
                                  </li>
                                )}
                                {valores.temValorAprovado && (
                                  <li className="flex justify-between gap-2 font-bold text-green-700 pt-1">
                                    <span>Total líquido</span>
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
            </div>
            );
          })()}

          {itensMes.itens.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Consolidado por item · {itensMes.entregas} entrega{itensMes.entregas !== 1 ? "s" : ""}
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
                    {itensMes.itens.map((i) => (
                      <tr key={i.produtoInstituicaoId}>
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
                        Total bruto
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(itensMes.valorBruto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {resumo.pagamentoConfirmado?.reciboHtml && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void baixarRecibo(
                    resumo.pagamentoConfirmado!.reciboHtml!,
                    nomeArquivoRecibo(resumo.mesReferencia, nomeCooperado)
                  )
                }
              >
                <FileDown size={16} /> Baixar recibo
              </Button>
            )}
            {resumo.pagamentoConfirmado?.assinaturaCooperado && (
              <div className="flex items-center gap-2 text-xs text-gray-600 bg-white border rounded-lg px-3 py-2">
                <PenLine size={14} />
                Assinado em{" "}
                {resumo.pagamentoConfirmado.assinadoEm
                  ? formatDate(resumo.pagamentoConfirmado.assinadoEm.split("T")[0])
                  : formatDate(resumo.pagamentoConfirmado.pagoEm.split("T")[0])}
              </div>
            )}
            {!quitado && resumo.valorAReceber > 0 && (
              <Link href="/ficha-corrida">
                <Button size="sm">
                  <Wallet size={16} /> Quanto vou receber
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CooperadoMinhaFichaTab({
  cooperadoId,
  cooperativaId,
  nomeCooperado,
  resumos,
  getEscolaLabel,
}: CooperadoMinhaFichaTabProps) {
  const data = useAppData();
  const [mesExpandido, setMesExpandido] = useState<string | null>(resumos[0]?.mesReferencia ?? null);

  const totalRecebido = useMemo(
    () => resumos.reduce((s, r) => s + r.valorRecebido, 0),
    [resumos]
  );

  const totalPendente = useMemo(
    () => resumos.reduce((s, r) => s + (r.pagamentoConfirmado ? 0 : r.valorAReceber), 0),
    [resumos]
  );

  if (resumos.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border border-dashed">
          <Wallet size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-800">Nenhum registro na ficha ainda</p>
          <p className="text-sm mt-2 max-w-sm mx-auto">
            Quando suas entregas forem conferidas, o extrato mensal aparecerá aqui com valores e detalhes.
          </p>
        </div>
        <ValoresAvulsosReceberPanel
          cooperadoId={cooperadoId}
          cooperativaId={cooperativaId}
          modo="cooperado"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-800 text-white p-5">
          <p className="text-emerald-100 text-sm">Total já recebido</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(totalRecebido)}</p>
          <p className="text-emerald-100/90 text-xs mt-2">Soma dos meses quitados com recibo assinado</p>
        </div>
        <div className="rounded-2xl bg-white border-2 border-green-200 p-5">
          <p className="text-gray-500 text-sm">Pendente de recebimento</p>
          <p className="text-3xl font-bold text-green-800 mt-1">{formatCurrency(totalPendente)}</p>
          {totalPendente > 0 && (
            <Link href="/ficha-corrida" className="inline-block mt-3 text-sm font-medium text-green-700 hover:underline">
              Ver em Quanto vou receber →
            </Link>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600">
        Extrato por mês com valores, descontos e cada entrega listada separadamente. Toque no mês para expandir.
      </p>

      <div className="space-y-3">
        {resumos.map((resumo) => (
          <MesFichaAccordion
            key={resumo.mesReferencia}
            resumo={resumo}
            cooperadoId={cooperadoId}
            cooperativaId={cooperativaId}
            nomeCooperado={nomeCooperado}
            getEscolaLabel={getEscolaLabel}
            expandido={mesExpandido === resumo.mesReferencia}
            onToggle={() =>
              setMesExpandido((cur) => (cur === resumo.mesReferencia ? null : resumo.mesReferencia))
            }
          />
        ))}
      </div>

      <ValoresAvulsosReceberPanel
        cooperadoId={cooperadoId}
        cooperativaId={cooperativaId}
        modo="cooperado"
      />
    </div>
  );
}
