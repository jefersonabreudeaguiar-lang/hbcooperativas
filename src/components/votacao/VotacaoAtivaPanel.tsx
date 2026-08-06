"use client";

import { useState } from "react";
import { CheckCircle2, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import type { VotacaoPauta } from "@/types";
import { formatDate } from "@/utils/format";
import { cn } from "@/utils/format";

interface VotacaoAtivaPanelProps {
  pauta: VotacaoPauta;
  onVotar: (voto: "sim" | "nao") => boolean | Promise<boolean>;
  processando?: boolean;
}

export function VotacaoAtivaPanel({ pauta, onVotar, processando }: VotacaoAtivaPanelProps) {
  const [confirmado, setConfirmado] = useState<"sim" | "nao" | null>(null);
  const [erro, setErro] = useState("");

  const handleVoto = async (voto: "sim" | "nao") => {
    setErro("");
    const ok = await onVotar(voto);
    if (ok) setConfirmado(voto);
    else setErro("Não foi possível registrar o voto. Tente novamente.");
  };

  if (confirmado) {
    return (
      <section className="rounded-2xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/80 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={24} />
          <div>
            <p className="font-semibold text-green-900">Voto registrado</p>
            <p className="text-sm text-green-800 mt-1">
              Sua resposta <strong>{confirmado === "sim" ? "SIM" : "NÃO"}</strong> foi computada na pauta da cooperativa.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-indigo-200 bg-white shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
        <div className="flex items-center gap-2 text-indigo-100 text-xs font-semibold uppercase tracking-wide">
          <Vote size={16} />
          Enquete da cooperativa
        </div>
        <p className="text-lg font-bold mt-2 leading-snug">{pauta.texto}</p>
        <p className="text-indigo-100 text-xs mt-2">
          Período: {formatDate(pauta.inicioEm)} até {formatDate(pauta.fimEm)}
        </p>
      </div>

      <div className="p-5">
        <p className="text-sm text-gray-600 mb-4 text-center">Toque na sua resposta — o voto é registrado na hora.</p>
        {erro && <p className="text-sm text-red-700 text-center mb-3">{erro}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={processando}
            onClick={() => void handleVoto("sim")}
            className={cn(
              "group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-green-500 bg-green-50 px-4 py-6",
              "text-green-900 font-bold text-lg transition-all active:scale-[0.98]",
              "hover:bg-green-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2",
              processando && "opacity-60 pointer-events-none"
            )}
          >
            <ThumbsUp size={32} className="text-green-600 group-hover:scale-110 transition-transform" />
            SIM
          </button>
          <button
            type="button"
            disabled={processando}
            onClick={() => void handleVoto("nao")}
            className={cn(
              "group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-50 px-4 py-6",
              "text-red-900 font-bold text-lg transition-all active:scale-[0.98]",
              "hover:bg-red-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2",
              processando && "opacity-60 pointer-events-none"
            )}
          >
            <ThumbsDown size={32} className="text-red-600 group-hover:scale-110 transition-transform" />
            NÃO
          </button>
        </div>
      </div>
    </section>
  );
}
