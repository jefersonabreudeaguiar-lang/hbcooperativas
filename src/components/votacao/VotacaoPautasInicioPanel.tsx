"use client";

import Link from "next/link";
import { ChevronRight, MessageCircle, Vote } from "lucide-react";
import type { VotacaoPauta } from "@/types";
import { formatHorarioReuniao, formatReuniaoWhatsapp, getEscopoEleitoralPauta } from "@/services/votacaoService";
import { formatDate } from "@/utils/format";

interface VotacaoPautasInicioPanelProps {
  pautas: VotacaoPauta[];
}

export function VotacaoPautasInicioPanel({ pautas }: VotacaoPautasInicioPanelProps) {
  if (pautas.length === 0) return null;

  return (
    <section className="rounded-2xl border-2 border-indigo-200 bg-white shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
        <div className="flex items-center gap-2 text-indigo-100 text-xs font-semibold uppercase tracking-wide">
          <Vote size={16} />
          Pautas de votação
        </div>
        <p className="text-sm text-indigo-100 mt-1">
          Deliberação via aplicativo HB Cooperativas — leia a pauta, vote e assine.
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {pautas.map((pauta) => {
          const reuniao = formatReuniaoWhatsapp(pauta);
          const horario = formatHorarioReuniao(pauta);

          return (
            <li key={pauta.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {getEscopoEleitoralPauta(pauta) === "diretoria" && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                    Votação da diretoria
                  </span>
                )}
              </div>
              <p className="font-semibold text-gray-900 leading-snug">{pauta.texto}</p>
              <p className="text-xs text-gray-500">
                Votação: {formatDate(pauta.inicioEm)} até {formatDate(pauta.fimEm)}
              </p>
              {pauta.observacao?.trim() && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {pauta.observacao.trim()}
                </p>
              )}
              {(reuniao || horario) && (
                <div className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-1">
                  {reuniao && (
                    <p className="flex items-start gap-1.5">
                      <MessageCircle size={14} className="shrink-0 mt-0.5" />
                      <span>
                        Reunião online (WhatsApp): <strong>{reuniao}</strong>
                      </span>
                    </p>
                  )}
                  {horario && <p>Horário previsto: {horario}</p>}
                </div>
              )}
              <Link
                href={`/votacao/${pauta.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-indigo-300 bg-indigo-50 px-4 py-3 text-indigo-900 font-semibold hover:bg-indigo-100 transition-colors"
              >
                Abrir votação
                <ChevronRight size={20} className="shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
