"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, FileDown, PenLine } from "lucide-react";
import type { ResumoVotacaoPauta } from "@/services/votacaoService";
import { horasRestantesResultadoPublicado, labelVoto } from "@/services/votacaoService";
import { formatDate } from "@/utils/format";
import { Card, StatCard } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { getData } from "@/services/dataStore";
import { baixarAtaDeliberacaoVotacaoPdf } from "@/utils/votacaoDeliberativaHtml";

interface VotacaoResultadoDetalheCooperadoProps {
  resumo: ResumoVotacaoPauta;
  cooperativaId: string;
  cooperadoId?: string;
}

export function VotacaoResultadoDetalheCooperado({
  resumo,
  cooperativaId,
  cooperadoId,
}: VotacaoResultadoDetalheCooperadoProps) {
  const [gerandoAta, setGerandoAta] = useState(false);
  const { pauta, votos, pctSim, pctNao, pctAbstencao, votosSim, votosNao, votosAbstencao, totalVotos, totalElegiveis } =
    resumo;
  const horasRestantes = pauta.resultadoPublicadoEm
    ? horasRestantesResultadoPublicado(pauta.resultadoPublicadoEm)
    : 0;
  const meuVoto = cooperadoId ? votos.find((v) => v.cooperadoId === cooperadoId) : undefined;
  const podeBaixarAta = totalVotos > 0;

  const baixarAta = async () => {
    setGerandoAta(true);
    try {
      await baixarAtaDeliberacaoVotacaoPdf(getData(), pauta.id, cooperativaId);
    } finally {
      setGerandoAta(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-900"
      >
        <ArrowLeft size={16} />
        Voltar ao Início
      </Link>

      <div>
        <div className="flex items-center gap-2 text-indigo-800 text-xs font-semibold uppercase tracking-wide">
          <BarChart3 size={16} />
          Resultado da votação
        </div>
        <h1 className="text-xl font-bold text-gray-900 mt-2 leading-snug">{pauta.texto}</h1>
        <p className="text-sm text-gray-500 mt-2">
          Período: {formatDate(pauta.inicioEm)} → {formatDate(pauta.fimEm)}
        </p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          Este relatório fica disponível por 24 horas após a publicação
          {horasRestantes > 0 ? ` (restam cerca de ${horasRestantes} h)` : ""}.
        </p>
      </div>

      {meuVoto?.assinaturaDataUrl && (
        <Card title="Sua assinatura nesta deliberação">
          <p className="text-sm text-gray-600 mb-3">
            Você votou <strong>{labelVoto(meuVoto.voto)}</strong> em {formatDate(meuVoto.createdAt.split("T")[0])}.
            Esta assinatura está registrada na ata oficial.
          </p>
          <div className="rounded-xl border border-green-200 bg-white p-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meuVoto.assinaturaDataUrl}
              alt="Sua assinatura na votação"
              className="max-h-16 max-w-full object-contain"
            />
          </div>
        </Card>
      )}

      {podeBaixarAta && (
        <Card title="Ata oficial">
          <p className="text-sm text-gray-600 mb-4">
            PDF com apuração, rol nominal e assinaturas de todos os votantes — incluindo a sua, se você participou.
          </p>
          <Button type="button" size="lg" onClick={() => void baixarAta()} disabled={gerandoAta}>
            <FileDown size={18} />
            {gerandoAta ? "Gerando ata…" : "Baixar ata em PDF"}
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="SIM" value={`${pctSim.toLocaleString("pt-BR")}%`} subtitle={`${votosSim} voto(s)`} />
        <StatCard title="NÃO" value={`${pctNao.toLocaleString("pt-BR")}%`} subtitle={`${votosNao} voto(s)`} variant="warning" />
        <StatCard title="Abstenção" value={`${pctAbstencao.toLocaleString("pt-BR")}%`} subtitle={`${votosAbstencao} voto(s)`} />
      </div>

      <Card title="Resumo">
        <p className="text-sm text-gray-700">
          {totalVotos} de {totalElegiveis} cooperado(s) votaram · percentuais sobre os votos computados (total 100%).
        </p>
      </Card>

      <Card title="Quem votou em quê">
        <DataTable
          data={votos.map((v) => ({ ...v }))}
          keyField="id"
          emptyMessage="Nenhum voto registrado nesta pauta."
          columns={[
            { key: "nome", label: "Cooperado", render: (v) => v.cooperadoNome },
            {
              key: "voto",
              label: "Voto",
              render: (v) => (
                <span
                  className={
                    v.voto === "sim"
                      ? "font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded"
                      : v.voto === "nao"
                        ? "font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded"
                        : "font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded"
                  }
                >
                  {labelVoto(v.voto)}
                </span>
              ),
            },
            {
              key: "assinatura",
              label: "Assinatura",
              render: (v) =>
                v.assinaturaDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.assinaturaDataUrl} alt="" className="h-8 max-w-[80px] object-contain" />
                ) : (
                  <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                    <PenLine size={12} /> —
                  </span>
                ),
            },
            { key: "data", label: "Quando", render: (v) => formatDate(v.createdAt.split("T")[0]) },
          ]}
        />
      </Card>
    </div>
  );
}
