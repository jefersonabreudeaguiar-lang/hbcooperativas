"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileDown,
  Images,
  Package,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import type { AppData, NotaPedido } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  agruparEntregasPorSemanaNoMes,
  agruparNotasEmEntregas,
  itensConsolidadosEntrega,
  statusEntregaCooperado,
  valoresEntregaCooperado,
  type EntregaCooperadoView,
} from "@/services/entregaCooperadoService";
import { textoInformativoDivisaoEntrega, nomesParticipantesDivisao } from "@/services/divisaoEntregaService";
import { useAppData } from "@/hooks/useAppData";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { NotaStatusTimeline } from "@/components/notas/NotaStatusTimeline";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";
import { baixarRecibo, nomeArquivoRecibo } from "@/utils/recibo";

interface CooperadoEntregasPorMesProps {
  resumos: ResumoMesEntregasCooperado[];
  nomeCooperado: string;
  ultimaNotaEnviadaIds?: string[];
  onReenviar: (nota: NotaPedido) => void;
  onExcluir: (nota: NotaPedido) => void;
  getEscolaLabel: (nota: NotaPedido) => string;
}

function notaPrincipal(entrega: EntregaCooperadoView): NotaPedido {
  return entrega.notas[0];
}

function ResumoMesCard({
  resumo,
  nomeCooperado,
  qtdEntregas,
}: {
  resumo: ResumoMesEntregasCooperado;
  nomeCooperado: string;
  qtdEntregas: number;
}) {
  const quitado = resumo.pagamentoConfirmado != null;
  const aguardandoPix = resumo.pagamentoAguardando != null;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 mb-4",
        quitado
          ? "bg-emerald-50/80 border-emerald-200"
          : aguardandoPix
            ? "bg-amber-50/80 border-amber-200"
            : resumo.valorAReceber > 0
              ? "bg-green-50/80 border-green-200"
              : "bg-white border-gray-200"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mês</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{formatMesReferencia(resumo.mesReferencia)}</p>
          <p className="text-sm text-gray-600 mt-1">
            {qtdEntregas} {qtdEntregas === 1 ? "entrega" : "entregas"} no mês
          </p>
        </div>
        <div className="text-right space-y-1">
          {quitado && (
            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-full">
              <CheckCircle2 size={16} />
              Recebido {formatCurrency(resumo.valorRecebido)}
            </div>
          )}
          {!quitado && resumo.valorAReceber > 0 && (
            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-green-800 bg-green-100 px-3 py-1.5 rounded-full">
              <Wallet size={16} />
              A receber {formatCurrency(resumo.valorAReceber)}
            </div>
          )}
          {aguardandoPix && !quitado && (
            <p className="text-xs text-amber-800 font-medium">Aguardando sua assinatura</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {resumo.emAnalise > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">
            <Clock size={12} /> {resumo.emAnalise} em análise
          </span>
        )}
        {resumo.rejeitadas > 0 && (
          <span className="text-xs font-medium text-red-800 bg-red-100 px-2.5 py-1 rounded-full">
            {resumo.rejeitadas} para corrigir
          </span>
        )}
        {resumo.conferidas > 0 && (
          <span className="text-xs font-medium text-green-800 bg-green-100 px-2.5 py-1 rounded-full">
            {resumo.conferidas} aprovada{resumo.conferidas !== 1 ? "s" : ""}
          </span>
        )}
        {resumo.pagas > 0 && (
          <span className="text-xs font-medium text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
            {resumo.pagas} paga{resumo.pagas !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {resumo.pagamentoConfirmado?.reciboHtml && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() =>
            void baixarRecibo(
              resumo.pagamentoConfirmado!.reciboHtml!,
              nomeArquivoRecibo(resumo.mesReferencia, nomeCooperado)
            )
          }
        >
          <FileDown size={16} /> Baixar recibo do mês
        </Button>
      )}
    </div>
  );
}

function EntregaSemanaItem({
  entrega,
  escola,
  expandida,
  recémEnviada,
  onToggle,
  onReenviar,
  onExcluir,
  data,
  cooperadoId,
}: {
  entrega: EntregaCooperadoView;
  escola: string;
  expandida: boolean;
  recémEnviada: boolean;
  onToggle: () => void;
  onReenviar: () => void;
  onExcluir: () => void;
  data: AppData | null;
  cooperadoId: string;
}) {
  const nota = notaPrincipal(entrega);
  const status = statusEntregaCooperado(entrega);
  const valores = valoresEntregaCooperado(entrega, data ?? undefined, cooperadoId);
  const itens = itensConsolidadosEntrega(entrega, data ?? undefined, cooperadoId);

  return (
    <div
      id={recémEnviada ? `nota-enviada-${entrega.id}` : undefined}
      className={cn(
        "rounded-2xl border overflow-hidden bg-white transition-shadow",
        expandida ? "border-green-400 shadow-md ring-1 ring-green-200" : "border-gray-200",
        recémEnviada && !expandida && "border-green-400 ring-2 ring-green-100"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50/80 transition-colors"
      >
        <div
          className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm",
            expandida ? "bg-green-700 text-white" : "bg-gray-100 text-gray-700"
          )}
        >
          {entrega.numeroNoMes}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">
            Entrega {entrega.numeroNoMes}
            {recémEnviada && (
              <span className="ml-2 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                Nova
              </span>
            )}
          </p>
          <p className="text-sm text-gray-600 truncate mt-0.5">{escola}</p>
          {nota.divisaoEntrega && nota.divisaoEntrega.participantes.length > 1 && (
            <p className="text-xs text-blue-800 mt-1 rounded-md bg-blue-50 border border-blue-100 px-2 py-1 inline-block">
              {textoInformativoDivisaoEntrega(nota.divisaoEntrega)}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{formatDate(entrega.dataEntrega)}</span>
            {entrega.qtdFotos > 0 && (
              <span className="inline-flex items-center gap-0.5 text-gray-400">
                <Images size={12} /> {entrega.qtdFotos} foto{entrega.qtdFotos !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <NotaStatusBadge status={status} />
          {valores.temValorAprovado && valores.valorBruto > 0 && (
            <span className="text-sm font-bold text-green-700">{formatCurrency(valores.valorBruto)}</span>
          )}
          {expandida ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
        </div>
      </button>

      <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
        <NotaStatusTimeline status={status} valorLiquido={valores.valorLiquido} />
      </div>

      {expandida && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4 bg-gray-50/50">
          {entrega.fotos.length > 0 ? (
            <div className={cn("grid gap-2", entrega.fotos.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
              {entrega.fotos.map((foto, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={foto}
                  alt={`Foto ${i + 1} da entrega ${entrega.numeroNoMes}`}
                  className="w-full rounded-xl border border-gray-200 object-cover max-h-72"
                />
              ))}
            </div>
          ) : (
            <div className="w-full aspect-[4/3] max-h-48 rounded-xl bg-gray-100 flex flex-col items-center justify-center text-gray-400 border border-dashed">
              <Camera size={32} />
              <p className="text-xs mt-2">{nota.lancamentoDireto ? "Entrega avulsa sem foto" : "Fotos na nuvem"}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Escola</p>
              <p className="font-medium text-gray-900 mt-0.5">{escola}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Referência</p>
              <p className="font-medium text-gray-900 mt-0.5">{nota.numeroNota}</p>
            </div>
          </div>

          {itens.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 bg-gray-50 border-b">
                Itens conferidos
              </p>
              <ul className="divide-y divide-gray-100 text-sm">
                {itens.map((item) => (
                  <li key={item.produtoInstituicaoId} className="flex justify-between gap-2 px-3 py-2">
                    <span className="text-gray-800">
                      {item.produtoNome} · {item.quantidade} {item.unidade}
                    </span>
                    {item.valorBruto > 0 && (
                      <span className="font-medium text-gray-900 shrink-0">{formatCurrency(item.valorBruto)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {valores.temValorAprovado && (
                <div className="border-t border-gray-100 px-3 py-2 space-y-1 text-sm bg-gray-50/80">
                  <div className="flex justify-between text-gray-700">
                    <span>Total bruto</span>
                    <span>{formatCurrency(valores.valorBruto)}</span>
                  </div>
                  {valores.valorDesconto > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Desconto cooperativa</span>
                      <span>- {formatCurrency(valores.valorDesconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-green-700 pt-1 border-t border-gray-200">
                    <span>Total líquido</span>
                    <span>{formatCurrency(valores.valorLiquido)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {nota.divisaoEntrega && nota.divisaoEntrega.participantes.length > 1 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2 text-sm text-blue-900">
              <p className="font-medium">{textoInformativoDivisaoEntrega(nota.divisaoEntrega)}</p>
              <p className="text-xs text-blue-800 mt-1">{nomesParticipantesDivisao(nota.divisaoEntrega)}</p>
            </div>
          )}

          {nota.motivoRejeicao && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {nota.motivoRejeicao}
            </p>
          )}

          {status === "rejeitada" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={onReenviar}>
                <RefreshCw size={16} /> Enviar de novo
              </Button>
              <Button size="sm" variant="danger" className="flex-1" onClick={onExcluir}>
                <Trash2 size={16} /> Excluir
              </Button>
            </div>
          )}
          {status === "aguardando_conferencia" && (
            <Button size="sm" variant="danger" className="w-full" onClick={onExcluir}>
              <Trash2 size={16} /> Excluir pendente
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CooperadoEntregasPorMes({
  resumos,
  nomeCooperado,
  ultimaNotaEnviadaIds = [],
  onReenviar,
  onExcluir,
  getEscolaLabel,
}: CooperadoEntregasPorMesProps) {
  const data = useAppData();
  const [expandidaId, setExpandidaId] = useState<string | null>(null);

  useEffect(() => {
    const nova = ultimaNotaEnviadaIds[0];
    if (nova) setExpandidaId(nova);
  }, [ultimaNotaEnviadaIds]);

  if (resumos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border border-dashed">
        <Camera size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="font-semibold text-gray-800">Nenhuma entrega registrada</p>
        <p className="text-sm mt-2 max-w-xs mx-auto">
          Cada vez que você enviar fotos para a cooperativa conta como uma entrega — mesmo com várias fotos no mesmo envio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {resumos.map((resumo) => {
        const entregas = agruparNotasEmEntregas(resumo.notas);
        const semanas = agruparEntregasPorSemanaNoMes(entregas, resumo.mesReferencia);

        return (
          <section key={resumo.mesReferencia} id={`mes-${resumo.mesReferencia}`}>
            <ResumoMesCard resumo={resumo} nomeCooperado={nomeCooperado} qtdEntregas={entregas.length} />

            {entregas.length > 0 && (
              <div className="space-y-6">
                {semanas.map((semana) => (
                  <div key={`${resumo.mesReferencia}-s${semana.indice}`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-2">
                      <Package size={14} />
                      {semana.rotulo}
                    </p>
                    <div className="space-y-3">
                      {semana.entregas.map((entrega) => {
                        const nota = notaPrincipal(entrega);
                        const cooperadoId = nota.cooperadoId;
                        return (
                          <EntregaSemanaItem
                            key={entrega.id}
                            entrega={entrega}
                            escola={getEscolaLabel(nota)}
                            expandida={expandidaId === entrega.id}
                            recémEnviada={ultimaNotaEnviadaIds.includes(entrega.id)}
                            onToggle={() => setExpandidaId((cur) => (cur === entrega.id ? null : entrega.id))}
                            onReenviar={() => onReenviar(nota)}
                            onExcluir={() => onExcluir(nota)}
                            data={data}
                            cooperadoId={cooperadoId}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!resumo.pagamentoConfirmado && resumo.valorAReceber > 0 && (
              <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-gray-600">
                  Totais aprovados deste mês estão em <strong>Minha ficha</strong> e em{" "}
                  <strong>Quanto vou receber</strong>.
                </p>
                <Link href="/ficha-corrida">
                  <Button size="sm" variant="secondary">
                    <Wallet size={16} /> Quanto vou receber
                  </Button>
                </Link>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
