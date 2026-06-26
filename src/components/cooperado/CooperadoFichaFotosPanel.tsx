"use client";

import { useMemo, useState } from "react";
import { Camera, ChevronDown, ChevronRight, Images } from "lucide-react";
import type { NotaPedido } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  agruparEntregasPorSemanaNoMes,
  agruparNotasEmEntregas,
  statusEntregaCooperado,
  type EntregaCooperadoView,
} from "@/services/entregaCooperadoService";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";

interface CooperadoFichaFotosPanelProps {
  resumos: ResumoMesEntregasCooperado[];
  getEscolaLabel: (nota: NotaPedido) => string;
}

function totalFotosMes(notas: NotaPedido[]): number {
  return agruparNotasEmEntregas(notas).reduce((s, e) => s + e.qtdFotos, 0);
}

function EntregaFotoCard({
  entrega,
  getEscolaLabel,
}: {
  entrega: EntregaCooperadoView;
  getEscolaLabel: (nota: NotaPedido) => string;
}) {
  const nota = entrega.notas[0];
  const status = statusEntregaCooperado(entrega);
  const escola = getEscolaLabel(nota);

  if (entrega.fotos.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Entrega {entrega.numeroNoMes} · {formatDate(entrega.dataEntrega)}
          </p>
          <p className="text-xs text-gray-500 truncate">{escola}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500 inline-flex items-center gap-1">
            <Images size={12} />
            {entrega.qtdFotos} foto{entrega.qtdFotos !== 1 ? "s" : ""}
          </span>
          <NotaStatusBadge status={status} />
        </div>
      </div>
      <div
        className={cn(
          "grid gap-1 p-1",
          entrega.fotos.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {entrega.fotos.map((foto, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${entrega.id}-${i}`}
            src={foto}
            alt={`Foto ${i + 1} — entrega ${entrega.numeroNoMes} de ${formatMesReferencia(entrega.mesReferencia)}`}
            className="w-full rounded-lg object-cover max-h-80 bg-gray-100"
          />
        ))}
      </div>
    </div>
  );
}

function MesFotosSection({
  resumo,
  getEscolaLabel,
  expandido,
  onToggle,
}: {
  resumo: ResumoMesEntregasCooperado;
  getEscolaLabel: (nota: NotaPedido) => string;
  expandido: boolean;
  onToggle: () => void;
}) {
  const entregas = useMemo(() => agruparNotasEmEntregas(resumo.notas), [resumo.notas]);
  const entregasComFoto = entregas.filter((e) => e.qtdFotos > 0);
  const qtdFotos = totalFotosMes(resumo.notas);
  const semanas = useMemo(
    () => agruparEntregasPorSemanaNoMes(entregasComFoto, resumo.mesReferencia),
    [entregasComFoto, resumo.mesReferencia]
  );

  if (qtdFotos === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-gray-50/80 transition-colors"
      >
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-800 flex items-center justify-center shrink-0">
          <Camera size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">{formatMesReferencia(resumo.mesReferencia)}</p>
          <p className="text-sm text-gray-600 mt-0.5">
            {qtdFotos} foto{qtdFotos !== 1 ? "s" : ""} · {entregasComFoto.length} entrega
            {entregasComFoto.length !== 1 ? "s" : ""}
          </p>
        </div>
        {expandido ? (
          <ChevronDown size={20} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={20} className="text-gray-400 shrink-0" />
        )}
      </button>

      {expandido && (
        <div className="border-t border-gray-100 px-4 sm:px-5 pb-5 pt-4 space-y-5 bg-gray-50/40">
          {semanas.map((semana) => (
            <div key={`${resumo.mesReferencia}-foto-s${semana.indice}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-2">
                {semana.rotulo}
              </p>
              <div className="space-y-4">
                {semana.entregas.map((entrega) => (
                  <EntregaFotoCard key={entrega.id} entrega={entrega} getEscolaLabel={getEscolaLabel} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CooperadoFichaFotosPanel({ resumos, getEscolaLabel }: CooperadoFichaFotosPanelProps) {
  const mesesComFoto = useMemo(
    () => resumos.filter((r) => totalFotosMes(r.notas) > 0),
    [resumos]
  );
  const [mesExpandido, setMesExpandido] = useState<string | null>(
    mesesComFoto[0]?.mesReferencia ?? null
  );

  const totalFotos = useMemo(
    () => mesesComFoto.reduce((s, r) => s + totalFotosMes(r.notas), 0),
    [mesesComFoto]
  );

  if (mesesComFoto.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border border-dashed">
        <Camera size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="font-semibold text-gray-800">Nenhuma foto na ficha ainda</p>
        <p className="text-sm mt-2 max-w-sm mx-auto">
          As fotos das suas entregas aparecerão aqui, organizadas por mês, assim que forem enviadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-900">
        <strong>{totalFotos}</strong> foto{totalFotos !== 1 ? "s" : ""} em{" "}
        <strong>{mesesComFoto.length}</strong> mês{mesesComFoto.length !== 1 ? "es" : ""}. Toque no mês para ver
        todas as imagens das entregas.
      </div>

      <div className="space-y-3">
        {mesesComFoto.map((resumo) => (
          <MesFotosSection
            key={resumo.mesReferencia}
            resumo={resumo}
            getEscolaLabel={getEscolaLabel}
            expandido={mesExpandido === resumo.mesReferencia}
            onToggle={() =>
              setMesExpandido((cur) => (cur === resumo.mesReferencia ? null : resumo.mesReferencia))
            }
          />
        ))}
      </div>
    </div>
  );
}
