"use client";

import { RefreshCw, Radio } from "lucide-react";
import type { ResumoVotacaoPauta } from "@/services/votacaoService";
import { labelVoto } from "@/services/votacaoService";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/format";

interface VotacaoPlacarAoVivoPanelProps {
  resumo: ResumoVotacaoPauta;
  lastUpdatedAt: number | null;
  pulling: boolean;
  onRefresh: () => void;
}

function formatHora(isoMs: number): string {
  return new Date(isoMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function VotacaoPlacarAoVivoPanel({
  resumo,
  lastUpdatedAt,
  pulling,
  onRefresh,
}: VotacaoPlacarAoVivoPanelProps) {
  const { pauta, totalVotos, totalElegiveis, votosSim, votosNao, votosAbstencao, pctSim, pctNao, pctAbstencao, pendentes, votos } =
    resumo;
  const pctParticipacao =
    totalElegiveis > 0 ? Math.round((totalVotos / totalElegiveis) * 1000) / 10 : 0;

  return (
    <section className="rounded-2xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-indigo-800 text-xs font-bold uppercase tracking-wide">
            <Radio size={14} className={cn(pulling && "animate-pulse")} />
            Placar ao vivo
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Atualiza automaticamente a cada 10 segundos
            {lastUpdatedAt ? ` · última leitura ${formatHora(lastUpdatedAt)}` : ""}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={pulling}>
          <RefreshCw size={16} className={cn(pulling && "animate-spin")} />
          {pulling ? "Atualizando…" : "Atualizar agora"}
        </Button>
      </div>

      <div className="p-5 space-y-4">
        <p className="font-semibold text-gray-900 leading-snug">{pauta.texto}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
            <p className="text-xs text-green-800 font-medium">SIM</p>
            <p className="text-3xl font-bold text-green-900 tabular-nums">{votosSim}</p>
            <p className="text-xs text-green-700">{pctSim.toLocaleString("pt-BR")}%</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
            <p className="text-xs text-red-800 font-medium">NÃO</p>
            <p className="text-3xl font-bold text-red-900 tabular-nums">{votosNao}</p>
            <p className="text-xs text-red-700">{pctNao.toLocaleString("pt-BR")}%</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-700 font-medium">Participação</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {totalVotos}/{totalElegiveis}
            </p>
            <p className="text-xs text-gray-500">{pctParticipacao.toLocaleString("pt-BR")}%</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
            <p className="text-xs text-amber-800 font-medium">Pendentes</p>
            <p className="text-3xl font-bold text-amber-900 tabular-nums">{pendentes.length}</p>
            <p className="text-xs text-amber-700">aguardando voto</p>
          </div>
        </div>

        {votosAbstencao > 0 && (
          <p className="text-sm text-gray-600 text-center">
            Abstenções: {votosAbstencao} ({pctAbstencao.toLocaleString("pt-BR")}%)
          </p>
        )}

        {votos.length > 0 && (
          <div className="border-t border-indigo-100 pt-3">
            <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Últimos votos registrados</p>
            <ul className="divide-y divide-gray-100 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-white/80">
              {[...votos]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 12)
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-800 truncate pr-2">{v.cooperadoNome}</span>
                    <span
                      className={
                        v.voto === "sim"
                          ? "font-bold text-green-700"
                          : v.voto === "nao"
                            ? "font-bold text-red-700"
                            : "font-bold text-gray-700"
                      }
                    >
                      {labelVoto(v.voto)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
