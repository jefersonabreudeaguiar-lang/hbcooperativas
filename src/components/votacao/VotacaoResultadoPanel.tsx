"use client";

import Link from "next/link";
import { BarChart3, ChevronRight, Vote } from "lucide-react";
import type { ResumoVotacaoPauta } from "@/services/votacaoService";
import { horasRestantesResultadoPublicado } from "@/services/votacaoService";
import { formatDate } from "@/utils/format";

interface VotacaoResultadoPanelProps {
  resumo: ResumoVotacaoPauta;
}

export function VotacaoResultadoPanel({ resumo }: VotacaoResultadoPanelProps) {
  const { pauta, pctSim, pctNao, pctAbstencao, votosSim, votosNao, votosAbstencao, totalVotos } = resumo;

  return (
    <section className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-100 bg-emerald-50/80">
        <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold uppercase tracking-wide">
          <BarChart3 size={16} />
          Resultado da votação
        </div>
        <p className="font-bold text-gray-900 mt-2 leading-snug">{pauta.texto}</p>
        <p className="text-xs text-gray-500 mt-1">
          Publicado em {pauta.resultadoPublicadoEm ? formatDate(pauta.resultadoPublicadoEm.split("T")[0]) : "—"} ·
          visível por 24 horas no mural
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-semibold text-green-800 flex items-center gap-1">
              <Vote size={14} /> SIM
            </span>
            <span className="font-bold text-green-900 tabular-nums">
              {pctSim.toLocaleString("pt-BR")}% ({votosSim})
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-700"
              style={{ width: `${Math.min(100, pctSim)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-semibold text-red-800">NÃO</span>
            <span className="font-bold text-red-900 tabular-nums">
              {pctNao.toLocaleString("pt-BR")}% ({votosNao})
            </span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-700"
              style={{ width: `${Math.min(100, pctNao)}%` }}
            />
          </div>
        </div>

        {votosAbstencao > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-semibold text-gray-700">ABSTENÇÃO</span>
              <span className="font-bold text-gray-900 tabular-nums">
                {pctAbstencao.toLocaleString("pt-BR")}% ({votosAbstencao})
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gray-400 to-gray-500 transition-all duration-700"
                style={{ width: `${Math.min(100, pctAbstencao)}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-center text-gray-500 pt-1">
          Total de {totalVotos} voto{totalVotos === 1 ? "" : "s"} computado{totalVotos === 1 ? "" : "s"}.
        </p>

        <Link
          href={`/votacao-resultado/${pauta.id}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 hover:bg-indigo-100 transition-colors"
        >
          <span className="text-sm font-semibold text-left leading-snug">
            Ver totais e quem votou
            {pauta.resultadoPublicadoEm && horasRestantesResultadoPublicado(pauta.resultadoPublicadoEm) > 0 ? (
              <span className="block text-xs font-normal text-indigo-700 mt-0.5">
                Disponível por mais ~{horasRestantesResultadoPublicado(pauta.resultadoPublicadoEm)} h
              </span>
            ) : null}
          </span>
          <ChevronRight size={20} className="shrink-0 text-indigo-600" />
        </Link>
      </div>
    </section>
  );
}
