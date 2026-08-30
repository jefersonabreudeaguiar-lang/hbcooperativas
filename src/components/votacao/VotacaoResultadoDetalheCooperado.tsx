"use client";

import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import type { ResumoVotacaoPauta } from "@/services/votacaoService";
import { horasRestantesResultadoPublicado, labelVoto } from "@/services/votacaoService";
import { formatDate } from "@/utils/format";
import { Card, StatCard } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Table";

interface VotacaoResultadoDetalheCooperadoProps {
  resumo: ResumoVotacaoPauta;
}

export function VotacaoResultadoDetalheCooperado({ resumo }: VotacaoResultadoDetalheCooperadoProps) {
  const { pauta, votos, pctSim, pctNao, pctAbstencao, votosSim, votosNao, votosAbstencao, totalVotos, totalElegiveis } =
    resumo;
  const horasRestantes = pauta.resultadoPublicadoEm
    ? horasRestantesResultadoPublicado(pauta.resultadoPublicadoEm)
    : 0;

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
            { key: "data", label: "Quando", render: (v) => formatDate(v.createdAt.split("T")[0]) },
          ]}
        />
      </Card>
    </div>
  );
}
