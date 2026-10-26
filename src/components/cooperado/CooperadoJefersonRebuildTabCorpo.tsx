"use client";

import type { User } from "@/types";
import type { CooperadoJefersonRebuildTab } from "@/lib/cooperado/cooperadoJefersonRebuildPilot";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

const TAB_COPY: Record<
  CooperadoJefersonRebuildTab,
  { titulo: string; subtitulo: string; card: string }
> = {
  inicio: {
    titulo: "Início",
    subtitulo: "Reconstrução piloto — valor a receber na próxima etapa.",
    card: "A receber",
  },
  entregas: {
    titulo: "Entregas",
    subtitulo: "Lista e fotos serão reativadas passo a passo.",
    card: "Suas entregas",
  },
  precos: {
    titulo: "Preços",
    subtitulo: "Catálogo da cooperativa em breve nesta versão.",
    card: "Tabela de preços",
  },
  financeiro: {
    titulo: "Financeiro",
    subtitulo: "Ficha e pagamentos voltam após homologação do início.",
    card: "Resumo do mês",
  },
};

type Props = {
  tab: CooperadoJefersonRebuildTab;
  user: Omit<User, "password">;
};

/** Casca visual — mesma linguagem do app, sem motor pesado (piloto Jeferson). */
export function CooperadoJefersonRebuildTabCorpo({ tab, user }: Props) {
  const copy = TAB_COPY[tab];
  const nome = user.name?.split(" ")[0] ?? "Cooperado";
  const mes = formatMesReferencia(getCurrentMesReferencia());

  return (
    <div className="space-y-6 max-w-3xl" data-cooperado-inicio-shell="1" data-cooperado-rebuild-tab={tab}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          {tab === "inicio" ? (
            <h1 className="text-2xl font-bold text-gray-900">Olá, {nome}!</h1>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900">{copy.titulo}</h1>
          )}
          <p className="text-sm text-gray-500 mt-1">{mes}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold shrink-0">
          piloto rebuild
        </span>
      </div>

      <p className="text-sm text-gray-600">{copy.subtitulo}</p>

      <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{copy.card}</p>
        <p className="mt-3 text-3xl font-bold text-gray-300 tabular-nums">—</p>
        <p className="mt-2 text-xs text-gray-400">Conteúdo desligado nesta fase. UI mantida para homologação.</p>
      </div>
    </div>
  );
}
