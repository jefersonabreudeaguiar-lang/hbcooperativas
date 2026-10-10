"use client";

import { useMemo, useState, useEffect, useRef, memo, startTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileDown,
  Package,
  PenLine,
  Wallet,
  Camera,
  BookOpen,
} from "lucide-react";
import {
  useAppDataSnapshotForDomains,
  useAppDataSelectorWhenActive,
} from "@/hooks/useAppData";
import { HB_CREDIT_PRODUCT_NAME } from "@/config/hbCreditBranding";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import { Button } from "@/components/ui/Button";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import { agregarItensFichaMes, resumoFromPagamento } from "@/services/notaPedidoService";
import { HistoricoHbCreditosResumo } from "@/components/ficha/HistoricoHbCreditosResumo";
import { normalizeCnpj } from "@/utils/cooperativa";
import { leituraFinanceiraParidadeCooperadoMesReferencia } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  getPagamentoRegistradoMesParaHistorico,
  listarResumosFotosCooperado,
  listarResumosExtratoHistoricoCooperado,
  ordenarResumosExtratoHistoricoPorDataPagamento,
  somarTotalRecebidoConfirmadoCooperado,
  notaTemFotoEnviadaCooperado,
} from "@/services/cooperadoEntregasService";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  agruparEntregasPorSemanaNoMes,
  agruparNotasEmEntregas,
  itensConsolidadosEntrega,
  statusEntregaCooperado,
  valoresEntregaCooperado,
} from "@/services/entregaCooperadoService";
import { ValoresAvulsosReceberPanel } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { CooperadoFichaFotosPanel } from "@/components/cooperado/CooperadoFichaFotosPanel";
import { bicCentralTotalValoresAvulsosPendentes } from "@/services/bicLeituraCentralDominios";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";
import { valorPendenteRecebimentoFichaCooperado } from "@/services/cooperadoFichaTimelineService";
import { baixarRecibo, nomeArquivoRecibo } from "@/utils/recibo";
import { CooperadoPagamentoMesView } from "@/components/cooperado/CooperadoPagamentoMesView";
import type { AppData, FichaCorridaDesconto } from "@/types";

const DESCONTOS_EXTRAS_VAZIOS: FichaCorridaDesconto[] = [];

export type ModoFichaExtrato = "cooperado" | "responsavel";

interface CooperadoMinhaFichaTabProps {
  cooperadoId: string;
  cooperativaId?: string;
  nomeCooperado: string;
  resumos: ResumoMesEntregasCooperado[];
  /** PWA mensageiro: histórico materializado pós-sync (evita lista vazia sem AppData ao vivo). */
  pagamentosRealizadosCache?: ResumoMesEntregasCooperado[];
  getEscolaLabel: (nota: import("@/types").NotaPedido) => string;
  modo?: ModoFichaExtrato;
}

function MesFichaAccordion({
  appData,
  resumo,
  cooperadoId,
  cooperativaId,
  nomeCooperado,
  getEscolaLabel,
  expandido,
  onToggle,
  onVerFotosMes,
  modo = "cooperado",
}: {
  appData: AppData | null;
  resumo: ResumoMesEntregasCooperado;
  cooperadoId: string;
  cooperativaId?: string;
  nomeCooperado: string;
  getEscolaLabel: CooperadoMinhaFichaTabProps["getEscolaLabel"];
  expandido: boolean;
  onToggle: () => void;
  onVerFotosMes?: (mesReferencia: string) => void;
  modo?: ModoFichaExtrato;
}) {
  const data = appData;
  const hbDescontosRevision = useContaCoopDescontosRevision();
  const [viewInterna, setViewInterna] = useState<"detalhes" | "fotos">("detalhes");
  const [hbAberto, setHbAberto] = useState(false);

  useEffect(() => {
    if (!expandido) {
      setViewInterna("detalhes");
      setHbAberto(false);
    }
  }, [expandido]);

  const resumoFotosMes = useMemo(() => {
    if (!data || !expandido) return null;
    return (
      listarResumosFotosCooperado(data, cooperadoId, cooperativaId).find(
        (r) => r.mesReferencia === resumo.mesReferencia
      ) ?? null
    );
  }, [data, cooperadoId, cooperativaId, resumo.mesReferencia, expandido]);

  const temFotosMes =
    !!resumoFotosMes && resumo.notas.some((n) => notaTemFotoEnviadaCooperado(n));

  const linkQuantoVouReceber =
    modo === "cooperado"
      ? "/ficha-corrida"
      : `/ficha-corrida?cooperado=${encodeURIComponent(cooperadoId)}`;
  const precisaDetalhesExpandido = expandido && viewInterna === "detalhes";

  const paridadeMes = useMemo(() => {
    if (!data) return null;
    return leituraFinanceiraParidadeCooperadoMesReferencia(
      data,
      cooperadoId,
      cooperativaId,
      resumo.mesReferencia
    );
  }, [data, cooperadoId, cooperativaId, resumo.mesReferencia, hbDescontosRevision]);

  const resumoCongeladoQuitado = useMemo(() => {
    if (!resumo.pagamentoConfirmado) return null;
    return resumoFromPagamento(resumo.pagamentoConfirmado);
  }, [resumo.pagamentoConfirmado]);

  const resumoPagamento = useMemo(() => {
    if (!precisaDetalhesExpandido) return null;
    if (resumo.pagamentoConfirmado && resumoCongeladoQuitado) return resumoCongeladoQuitado;
    return paridadeMes?.resumo ?? null;
  }, [precisaDetalhesExpandido, resumo.pagamentoConfirmado, resumoCongeladoQuitado, paridadeMes?.resumo]);

  const descontosExtrasExibicao =
    resumo.pagamentoConfirmado && resumoCongeladoQuitado
      ? resumoCongeladoQuitado.descontosExtras
      : paridadeMes?.descontosExtras ?? DESCONTOS_EXTRAS_VAZIOS;

  const coopCnpjResumo = useMemo(() => {
    if (!data || !cooperativaId) return "";
    const coop = data.cooperativas.find((c) => c.id === cooperativaId);
    return normalizeCnpj(coop?.cnpj ?? "");
  }, [data, cooperativaId]);

  const itensMes = useMemo(() => {
    if (!data || !precisaDetalhesExpandido) return { itens: [], entregas: 0, valorBruto: 0 };
    const apenasPendentes = !resumo.pagamentoConfirmado && !resumo.pagamentoAguardando;
    return agregarItensFichaMes(data, cooperadoId, resumo.mesReferencia, cooperativaId, { apenasPendentes });
  }, [
    data,
    cooperadoId,
    resumo.mesReferencia,
    cooperativaId,
    resumo.pagamentoConfirmado,
    resumo.pagamentoAguardando,
    precisaDetalhesExpandido,
  ]);

  const avulsosPendentes = useMemo(() => {
    if (!data || !precisaDetalhesExpandido) return 0;
    return bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, resumo.mesReferencia, cooperativaId);
  }, [data, cooperadoId, resumo.mesReferencia, cooperativaId, precisaDetalhesExpandido]);

  if (!data) return null;

  const quitado = !!resumo.pagamentoConfirmado;
  const aguardando = !!resumo.pagamentoAguardando;
  const valorLiquidoExibir = quitado
    ? resumo.valorRecebido
    : paridadeMes?.valorLiquido ?? resumo.valorAReceber;

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
            {!quitado && valorLiquidoExibir > 0 && ` · a receber ${formatCurrency(valorLiquidoExibir)}`}
          </p>
        </div>
        {expandido ? <ChevronDown size={20} className="text-gray-400 shrink-0" /> : <ChevronRight size={20} className="text-gray-400 shrink-0" />}
      </button>

      {expandido && (
        <div className="border-t border-gray-100 px-4 sm:px-5 pb-5 pt-4 space-y-5 bg-gray-50/40">
          {temFotosMes && (
            <div className="flex gap-2 border-b border-gray-200 pb-2">
              <button
                type="button"
                onClick={() => setViewInterna("detalhes")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg",
                  viewInterna === "detalhes"
                    ? "bg-green-100 text-green-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                Detalhes
              </button>
              <button
                type="button"
                onClick={() => setViewInterna("fotos")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg inline-flex items-center gap-1.5",
                  viewInterna === "fotos"
                    ? "bg-green-100 text-green-800"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <Camera size={14} /> Fotos
              </button>
            </div>
          )}

          {viewInterna === "fotos" && temFotosMes && resumoFotosMes ? (
            <CooperadoFichaFotosPanel
              resumos={[resumoFotosMes]}
              getEscolaLabel={getEscolaLabel}
              cooperativaId={cooperativaId}
              modoInline
            />
          ) : (
            <>
          {resumoPagamento && (
          <>
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
                ) : valorLiquidoExibir > 0 ? (
                  <span className="text-green-700">A receber</span>
                ) : (
                  <span className="text-gray-600">Em conferência</span>
                )}
              </p>
            </div>
          </div>

          {(resumoPagamento.valorBruto > 0 || valorLiquidoExibir > 0 || quitado) && (
            <div className="rounded-xl overflow-hidden">
              <ResumoDescontosMes
                valorBruto={resumoPagamento.valorBruto}
                descontoCooperativa={resumoPagamento.descontoCooperativa}
                descontoPadraoPct={data.config.descontoPadraoCooperativa}
                valorEntregas={resumoPagamento.valorEntregas}
                descontosExtras={descontosExtrasExibicao}
                totalLiquido={quitado ? resumo.valorRecebido : valorLiquidoExibir}
                rotuloTotal={quitado ? "Total recebido" : "Total líquido"}
              />
            </div>
          )}

          {quitado && coopCnpjResumo.length === 14 && resumoPagamento && (
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setHbAberto((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                aria-expanded={hbAberto}
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{HB_CREDIT_PRODUCT_NAME}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {hbAberto ? "Resumo das compras no mês" : "Toque para ver o resumo"}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={cn("text-gray-400 shrink-0 transition-transform", hbAberto && "rotate-180")}
                />
              </button>
              {hbAberto && (
                <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/40">
                  <HistoricoHbCreditosResumo
                    cnpj={coopCnpjResumo}
                    cooperadoId={cooperadoId}
                    mesReferencia={resumo.mesReferencia}
                    valorEntregas={resumoPagamento.valorEntregas}
                    descontosExtras={descontosExtrasExibicao}
                    variant="cooperado"
                    somenteMesReferencia
                  />
                </div>
              )}
            </section>
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
            {temFotosMes && (
              <Button size="sm" variant="secondary" onClick={() => setViewInterna("fotos")}>
                <Camera size={16} /> Fotos do mês
              </Button>
            )}
            {!quitado && resumo.valorAReceber > 0 && (
              <Link href={linkQuantoVouReceber}>
                <Button size="sm">
                  <Wallet size={16} /> Financeiro
                </Button>
              </Link>
            )}
          </div>
          </>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const CooperadoMinhaFichaTab = memo(function CooperadoMinhaFichaTab({
  cooperadoId,
  cooperativaId,
  nomeCooperado,
  resumos,
  pagamentosRealizadosCache,
  getEscolaLabel,
  modo = "cooperado",
}: CooperadoMinhaFichaTabProps) {
  const [mesExpandido, setMesExpandido] = useState<string | null>(resumos[0]?.mesReferencia ?? null);
  const [mesHistoricoAtivo, setMesHistoricoAtivo] = useState<string | null>(null);
  const [subAba, setSubAba] = useState<"extrato" | "pagamentos" | "fotos">("extrato");
  const [fotosMesFocus, setFotosMesFocus] = useState<string | null>(null);

  const abaPagamentosAtiva = subAba === "pagamentos";
  const abaExtratoAtiva = subAba === "extrato";
  const abaFotosAtiva = subAba === "fotos";

  const data = useAppDataSnapshotForDomains(["financeiro", "notas"] as const);

  const trocarSubAba = (aba: "extrato" | "pagamentos" | "fotos") => {
    startTransition(() => setSubAba(aba));
  };

  const resumosHistoricoLive = useMemo(() => {
    if (!data) return [];
    return listarResumosExtratoHistoricoCooperado(data, cooperadoId, cooperativaId);
  }, [data, cooperadoId, cooperativaId]);

  const resumosHistorico = useMemo(() => {
    const byMes = new Map<string, ResumoMesEntregasCooperado>();
    for (const r of pagamentosRealizadosCache ?? []) {
      if (!r.pagamentoConfirmado && !r.pagamentoAguardando && r.valorRecebido <= 0) continue;
      byMes.set(r.mesReferencia, r);
    }
    for (const r of resumosHistoricoLive) {
      byMes.set(r.mesReferencia, r);
    }
    return ordenarResumosExtratoHistoricoPorDataPagamento([...byMes.values()]);
  }, [pagamentosRealizadosCache, resumosHistoricoLive]);

  const totalRecebido = useAppDataSelectorWhenActive(
    abaPagamentosAtiva,
    (d) => somarTotalRecebidoConfirmadoCooperado(d, cooperadoId, cooperativaId),
    [cooperadoId, cooperativaId]
  ) ?? 0;

  const abrirFotosDoMes = (mesReferencia: string) => {
    setFotosMesFocus(mesReferencia);
    trocarSubAba("fotos");
  };

  const totalPendente = useAppDataSelectorWhenActive(
    abaExtratoAtiva,
    (d) => valorPendenteRecebimentoFichaCooperado(d, cooperadoId, cooperativaId),
    [cooperadoId, cooperativaId]
  ) ?? 0;

  const linkQuantoVouReceber =
    modo === "cooperado"
      ? "/ficha-corrida"
      : `/ficha-corrida?cooperado=${encodeURIComponent(cooperadoId)}`;

  const resumosFotos = useMemo(() => {
    if (!abaFotosAtiva || !data) return [];
    return listarResumosFotosCooperado(data, cooperadoId, cooperativaId);
  }, [abaFotosAtiva, data, cooperadoId, cooperativaId]);

  const mesesHistoricoKey = useMemo(
    () => resumosHistorico.map((r) => r.mesReferencia).join("|"),
    [resumosHistorico]
  );

  useEffect(() => {
    if (!mesesHistoricoKey) {
      setMesHistoricoAtivo(null);
      return;
    }
    const meses = mesesHistoricoKey.split("|");
    setMesHistoricoAtivo((atual) => (atual && meses.includes(atual) ? atual : meses[0]!));
  }, [mesesHistoricoKey]);

  const aplicouAbaInicialRef = useRef(false);
  useEffect(() => {
    if (aplicouAbaInicialRef.current) return;
    if (resumos.length > 0) {
      aplicouAbaInicialRef.current = true;
      return;
    }
    if (resumosHistorico.length > 0) {
      startTransition(() => setSubAba("pagamentos"));
      aplicouAbaInicialRef.current = true;
    }
  }, [resumos.length, resumosHistorico.length]);

  const resumoHistoricoAtivo = useMemo(
    () => resumosHistorico.find((r) => r.mesReferencia === mesHistoricoAtivo) ?? null,
    [resumosHistorico, mesHistoricoAtivo]
  );

  const resumoHistoricoAtivoEnriquecido = useMemo(() => {
    if (!abaPagamentosAtiva || !resumoHistoricoAtivo || !data) return resumoHistoricoAtivo;
    if (resumoHistoricoAtivo.pagamentoConfirmado || resumoHistoricoAtivo.pagamentoAguardando) {
      return resumoHistoricoAtivo;
    }
    const pagamento = getPagamentoRegistradoMesParaHistorico(
      data,
      cooperadoId,
      resumoHistoricoAtivo.mesReferencia,
      cooperativaId
    );
    if (!pagamento) return resumoHistoricoAtivo;
    const confirmado = pagamento.status === "confirmado";
    return {
      ...resumoHistoricoAtivo,
      pagamentoConfirmado: confirmado ? pagamento : resumoHistoricoAtivo.pagamentoConfirmado,
      pagamentoAguardando: confirmado ? resumoHistoricoAtivo.pagamentoAguardando : pagamento,
      valorRecebido: pagamento.valorLiquido ?? resumoHistoricoAtivo.valorRecebido,
    };
  }, [abaPagamentosAtiva, resumoHistoricoAtivo, data, cooperadoId, cooperativaId]);

  if (resumos.length === 0 && resumosHistorico.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => trocarSubAba("extrato")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
              subAba === "extrato"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <BookOpen size={16} /> Extrato
          </button>
          <button
            type="button"
            onClick={() => trocarSubAba("fotos")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
              subAba === "fotos"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Camera size={16} /> Fotos por mês
          </button>
        </div>

        {subAba === "fotos" ? (
          <CooperadoFichaFotosPanel
            resumos={resumosFotos}
            getEscolaLabel={getEscolaLabel}
            cooperativaId={cooperativaId}
            mesReferenciaInicial={fotosMesFocus}
          />
        ) : (
          <>
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
              modo={modo === "responsavel" ? "responsavel" : "cooperado"}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => trocarSubAba("extrato")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
            subAba === "extrato"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <BookOpen size={16} /> Extrato
        </button>
        <button
          type="button"
          onClick={() => trocarSubAba("pagamentos")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
            subAba === "pagamentos"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <CheckCircle2 size={16} /> Pagamentos realizados
        </button>
        <button
          type="button"
          onClick={() => trocarSubAba("fotos")}
          className={cn(
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
            subAba === "fotos"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <Camera size={16} /> Fotos por mês
        </button>
      </div>

      {subAba === "fotos" ? (
        <CooperadoFichaFotosPanel
          resumos={resumosFotos}
          getEscolaLabel={getEscolaLabel}
          cooperativaId={cooperativaId}
          mesReferenciaInicial={fotosMesFocus}
        />
      ) : subAba === "pagamentos" ? (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-800 text-white p-5">
            <p className="text-emerald-100 text-sm">Total já recebido</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(totalRecebido)}</p>
            <p className="text-emerald-100/90 text-xs mt-2">
              Pagamentos confirmados pela cooperativa · painel build {APP_BUILD_VERSION}
            </p>
          </div>
          {resumosHistorico.length > 0 ? (
            <>
              <p className="text-sm text-gray-600">
                Escolha o mês para ver o PIX recebido, descontos, compras HB Créditos, entregas e itens —
                tudo como ficou no momento do pagamento.
              </p>
              <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
                {resumosHistorico.map((r) => (
                  <button
                    key={`tab-hist-${r.mesReferencia}`}
                    type="button"
                    onClick={() => setMesHistoricoAtivo(r.mesReferencia)}
                    className={cn(
                      "px-3 py-2 text-sm font-medium rounded-lg border transition-colors text-left",
                      mesHistoricoAtivo === r.mesReferencia
                        ? "border-green-600 bg-green-50 text-green-800"
                        : "border-transparent text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <span className="block">{formatMesReferencia(r.mesReferencia)}</span>
                    {r.valorRecebido > 0 && (
                      <span className="block text-xs font-semibold text-emerald-700 mt-0.5">
                        {formatCurrency(r.valorRecebido)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {resumoHistoricoAtivoEnriquecido &&
              (resumoHistoricoAtivoEnriquecido.pagamentoConfirmado ||
                resumoHistoricoAtivoEnriquecido.pagamentoAguardando ||
                resumoHistoricoAtivoEnriquecido.valorRecebido > 0) ? (
                <CooperadoPagamentoMesView
                  key={`hist-pg-${resumoHistoricoAtivoEnriquecido.mesReferencia}`}
                  resumo={resumoHistoricoAtivoEnriquecido}
                  cooperadoId={cooperadoId}
                  cooperativaId={cooperativaId}
                  nomeCooperado={nomeCooperado}
                  getEscolaLabel={getEscolaLabel}
                  onVerFotosMes={abrirFotosDoMes}
                />
              ) : resumoHistoricoAtivoEnriquecido ? (
                <MesFichaAccordion
                  key={`hist-${resumoHistoricoAtivoEnriquecido.mesReferencia}`}
                  appData={data}
                  resumo={resumoHistoricoAtivoEnriquecido}
                  cooperadoId={cooperadoId}
                  cooperativaId={cooperativaId}
                  nomeCooperado={nomeCooperado}
                  getEscolaLabel={getEscolaLabel}
                  expandido
                  onToggle={() => undefined}
                  onVerFotosMes={abrirFotosDoMes}
                  modo={modo}
                />
              ) : null}
            </>
          ) : (
            <div className="text-center py-10 text-gray-500 bg-white rounded-2xl border border-dashed">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-800">Nenhum pagamento registrado ainda</p>
              <p className="text-sm mt-2">Após a cooperativa confirmar o PIX, o resumo aparece aqui.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border-2 border-green-200 p-5 sm:col-span-2">
              <p className="text-gray-500 text-sm">Pendente de recebimento</p>
              <p className="text-3xl font-bold text-green-800 mt-1">{formatCurrency(totalPendente)}</p>
              {totalPendente > 0 && (
                <Link
                  href={linkQuantoVouReceber}
                  className="inline-block mt-3 text-sm font-medium text-green-700 hover:underline"
                >
                  Ver em Financeiro →
                </Link>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Somente valores novos ainda não pagos. Meses quitados ficam em{" "}
            <strong>Pagamentos realizados</strong>.
          </p>

          {resumos.length > 0 ? (
            <div className="space-y-3">
              {resumos.map((resumo) => (
                <MesFichaAccordion
                  key={resumo.mesReferencia}
                  appData={data}
                  resumo={resumo}
                  cooperadoId={cooperadoId}
                  cooperativaId={cooperativaId}
                  nomeCooperado={nomeCooperado}
                  getEscolaLabel={getEscolaLabel}
                  expandido={mesExpandido === resumo.mesReferencia}
                  onToggle={() =>
                    setMesExpandido((cur) => (cur === resumo.mesReferencia ? null : resumo.mesReferencia))
                  }
                  modo={modo}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-white rounded-2xl border border-dashed">
              <Wallet size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-800">Nenhum valor em aberto</p>
            </div>
          )}

          <ValoresAvulsosReceberPanel
            cooperadoId={cooperadoId}
            cooperativaId={cooperativaId}
            modo={modo === "responsavel" ? "responsavel" : "cooperado"}
          />
        </>
      )}
    </div>
  );
});
