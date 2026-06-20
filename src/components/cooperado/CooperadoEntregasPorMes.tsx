"use client";

import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileDown,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import type { NotaPedido } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";
import { getFotoExibicaoNota } from "@/utils/fotoEntrega";
import { baixarReciboHtml, nomeArquivoRecibo } from "@/utils/recibo";

interface CooperadoEntregasPorMesProps {
  resumos: ResumoMesEntregasCooperado[];
  nomeCooperado: string;
  ultimaNotaEnviadaIds?: string[];
  onVerNota: (nota: NotaPedido) => void;
  onReenviar: (nota: NotaPedido) => void;
  onExcluir: (nota: NotaPedido) => void;
  getEscolaLabel: (nota: NotaPedido) => string;
}

function ResumoMesCard({
  resumo,
  nomeCooperado,
}: {
  resumo: ResumoMesEntregasCooperado;
  nomeCooperado: string;
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
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resumo do mês</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{formatMesReferencia(resumo.mesReferencia)}</p>
          <p className="text-sm text-gray-600 mt-1">
            {resumo.quantidadeEntregas} entrega{resumo.quantidadeEntregas !== 1 ? "s" : ""}
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
            baixarReciboHtml(
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

function FotoEntregaCard({
  nota,
  escola,
  recémEnviada,
  onVer,
  onReenviar,
  onExcluir,
}: {
  nota: NotaPedido;
  escola: string;
  recémEnviada: boolean;
  onVer: () => void;
  onReenviar: () => void;
  onExcluir: () => void;
}) {
  const foto = getFotoExibicaoNota(nota);

  return (
    <div
      className={cn(
        "bg-white border rounded-2xl overflow-hidden shadow-sm",
        recémEnviada && "ring-2 ring-green-400 border-green-400"
      )}
    >
      <button type="button" onClick={onVer} className="w-full text-left">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="w-full aspect-[4/3] object-cover" />
        ) : (
          <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center text-gray-400">
            <Camera size={32} />
          </div>
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-gray-900 line-clamp-2">{escola}</p>
            <NotaStatusBadge status={nota.status} />
          </div>
          <p className="text-xs text-gray-500 mt-1">{formatDate(nota.dataEntrega)}</p>
          {nota.valorLiquido > 0 && (
            <p className="text-sm font-bold text-green-700 mt-2">{formatCurrency(nota.valorLiquido)}</p>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium mt-2">
            Ver detalhes <ChevronRight size={14} />
          </span>
        </div>
      </button>

      {nota.status === "rejeitada" && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          {nota.motivoRejeicao && (
            <p className="text-xs text-red-600">{nota.motivoRejeicao}</p>
          )}
          <Button size="sm" variant="secondary" className="w-full" onClick={onReenviar}>
            <RefreshCw size={16} /> Enviar de novo
          </Button>
          <Button size="sm" variant="danger" className="w-full" onClick={onExcluir}>
            <Trash2 size={16} /> Excluir
          </Button>
        </div>
      )}
      {nota.status === "aguardando_conferencia" && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
          <Button size="sm" variant="danger" className="w-full" onClick={onExcluir}>
            <Trash2 size={16} /> Excluir pendente
          </Button>
        </div>
      )}
    </div>
  );
}

export function CooperadoEntregasPorMes({
  resumos,
  nomeCooperado,
  ultimaNotaEnviadaIds = [],
  onVerNota,
  onReenviar,
  onExcluir,
  getEscolaLabel,
}: CooperadoEntregasPorMesProps) {
  if (resumos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border border-dashed">
        <Camera size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="font-semibold text-gray-800">Nenhuma entrega registrada</p>
        <p className="text-sm mt-2 max-w-xs mx-auto">
          Tire foto do pedido assinado na escola. Cada foto vira uma entrega na cooperativa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {resumos.map((resumo) => (
        <section key={resumo.mesReferencia} id={`mes-${resumo.mesReferencia}`}>
          <ResumoMesCard resumo={resumo} nomeCooperado={nomeCooperado} />

          {resumo.notas.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 px-1">
                Fotos das entregas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {resumo.notas.map((nota) => (
                  <FotoEntregaCard
                    key={nota.id}
                    nota={nota}
                    escola={getEscolaLabel(nota)}
                    recémEnviada={ultimaNotaEnviadaIds.includes(nota.id)}
                    onVer={() => onVerNota(nota)}
                    onReenviar={() => onReenviar(nota)}
                    onExcluir={() => onExcluir(nota)}
                  />
                ))}
              </div>
            </>
          )}

          {!resumo.pagamentoConfirmado && resumo.valorAReceber > 0 && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-gray-600">
                Valores aprovados deste mês aparecem em <strong>Quanto vou receber</strong>.
              </p>
              <Link href="/ficha-corrida">
                <Button size="sm" variant="secondary">
                  <Wallet size={16} /> Ver quanto vou receber
                </Button>
              </Link>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
