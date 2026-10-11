"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronRight, Images } from "lucide-react";
import type { NotaPedido } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  agruparEntregasPorSemanaNoMes,
  agruparNotasEmEntregas,
  statusEntregaCooperado,
  type EntregaCooperadoView,
} from "@/services/entregaCooperadoService";
import { resolveFotosNotaParaExibicao } from "@/services/notaPedidoCloudService";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { FotoLightbox, FotoLightboxTrigger } from "@/components/ui/FotoLightbox";
import { contarFotosEnviadasNota, contarFotosEnviadasNotas } from "@/utils/fotoEntrega";
import { normalizeCnpj } from "@/utils/cooperativa";
import { formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";

function EntregaFotosGrid({
  nota,
  cnpj,
  qtdFotos,
}: {
  nota: NotaPedido;
  cnpj?: string;
  qtdFotos: number;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [erro, setErro] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (qtdFotos <= 0) {
      setUrls([]);
      setErro(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setErro(false);
      const resolved = await resolveFotosNotaParaExibicao(nota, cnpj);
      if (cancelled) {
        for (const url of resolved) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        }
        return;
      }

      for (const old of blobUrlsRef.current) {
        if (old.startsWith("blob:")) URL.revokeObjectURL(old);
      }
      blobUrlsRef.current = resolved.filter((u) => u.startsWith("blob:"));
      setUrls(resolved);
      setErro(resolved.length === 0 && qtdFotos > 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [nota.id, nota.updatedAt, nota.fotoNaNuvem, nota.fotosEnviadasCount, cnpj, qtdFotos]);

  useEffect(() => {
    setLightboxIndex(null);
  }, [nota.id, urls.length]);

  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      blobUrlsRef.current = [];
    };
  }, []);

  if (qtdFotos <= 0) return null;

  if (urls.length === 0) {
    return (
      <div className="p-3 text-center text-sm text-gray-500 bg-gray-50 border-t border-gray-100">
        {erro ? "Não foi possível carregar as fotos. Verifique a internet e abra de novo." : "Carregando fotos…"}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "grid gap-1 p-1",
          urls.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {urls.map((foto, i) => (
          <FotoLightboxTrigger
            key={`${nota.id}-foto-${i}`}
            src={foto}
            alt={`Foto ${i + 1} — ${nota.numeroNota}`}
            imgClassName="w-full rounded-lg object-cover max-h-80 bg-gray-100 min-h-[8rem]"
            onOpen={() => setLightboxIndex(i)}
          />
        ))}
      </div>
      <FotoLightbox
        open={lightboxIndex !== null}
        items={urls.map((src, i) => ({
          src,
          alt: `Foto ${i + 1} — ${nota.numeroNota}`,
        }))}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function EntregaFotoCard({
  entrega,
  getEscolaLabel,
  cnpj,
}: {
  entrega: EntregaCooperadoView;
  getEscolaLabel: (nota: NotaPedido) => string;
  cnpj?: string;
}) {
  const nota = entrega.notas[0];
  const status = statusEntregaCooperado(entrega);
  const escola = getEscolaLabel(nota);
  const qtdFotos = entrega.notas.reduce((s, n) => s + contarFotosEnviadasNota(n), 0);

  if (qtdFotos <= 0) return null;

  const cnpjNota = cnpj ?? (nota.cooperativaCnpj ? normalizeCnpj(nota.cooperativaCnpj) : undefined);

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
            {qtdFotos} foto{qtdFotos !== 1 ? "s" : ""}
          </span>
          <NotaStatusBadge status={status} />
        </div>
      </div>
      {entrega.notas.map((n) => (
        <EntregaFotosGrid
          key={n.id}
          nota={n}
          cnpj={cnpjNota}
          qtdFotos={contarFotosEnviadasNota(n)}
        />
      ))}
    </div>
  );
}

export function CooperadoMesFotosConteudo({
  resumo,
  getEscolaLabel,
  cnpj,
}: {
  resumo: ResumoMesEntregasCooperado;
  getEscolaLabel: (nota: NotaPedido) => string;
  cnpj?: string;
}) {
  const entregas = useMemo(() => agruparNotasEmEntregas(resumo.notas), [resumo.notas]);
  const entregasComFoto = entregas.filter((e) =>
    e.notas.some((n) => contarFotosEnviadasNota(n) > 0)
  );
  const semanas = useMemo(
    () => agruparEntregasPorSemanaNoMes(entregasComFoto, resumo.mesReferencia),
    [entregasComFoto, resumo.mesReferencia]
  );

  return (
    <div className="space-y-5">
      {semanas.map((semana) => (
        <div key={`${resumo.mesReferencia}-foto-s${semana.indice}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3 inline-flex items-center gap-2">
            {semana.rotulo}
          </p>
          <div className="space-y-4">
            {semana.entregas.map((entrega) => (
              <EntregaFotoCard
                key={entrega.id}
                entrega={entrega}
                getEscolaLabel={getEscolaLabel}
                cnpj={cnpj}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sanfona local — todas as fotos do mês (Entregas quitadas ou aba Fotos da ficha). */
export function CooperadoMesEntregasFotosSanfona({
  resumo,
  getEscolaLabel,
  cnpj,
  expandido,
  onToggle,
  compacto,
}: {
  resumo: ResumoMesEntregasCooperado;
  getEscolaLabel: (nota: NotaPedido) => string;
  cnpj?: string;
  expandido: boolean;
  onToggle: () => void;
  compacto?: boolean;
}) {
  const qtdFotos = contarFotosEnviadasNotas(resumo.notas);
  const entregas = useMemo(() => agruparNotasEmEntregas(resumo.notas), [resumo.notas]);
  const entregasComFoto = entregas.filter((e) =>
    e.notas.some((n) => contarFotosEnviadasNota(n) > 0)
  );

  if (qtdFotos === 0) return null;

  const tituloMes = formatMesReferencia(resumo.mesReferencia);

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden shadow-sm",
        compacto ? "border-emerald-200 bg-white mb-4" : "border-gray-200 bg-white"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-4 text-left hover:bg-gray-50/80 transition-colors",
          compacto ? "p-3 sm:p-4" : "p-4 sm:p-5"
        )}
        aria-expanded={expandido}
      >
        <div
          className={cn(
            "rounded-xl flex items-center justify-center shrink-0",
            compacto ? "w-10 h-10 bg-emerald-100 text-emerald-800" : "w-12 h-12 bg-green-100 text-green-800"
          )}
        >
          <Camera size={compacto ? 18 : 22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-bold text-gray-900", compacto && "text-sm")}>
            {compacto ? "Fotos do mês quitado" : tituloMes}
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            {compacto && <span className="text-gray-500">{tituloMes} · </span>}
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
        <div className="border-t border-gray-100 px-4 sm:px-5 pb-5 pt-4 bg-gray-50/40">
          <CooperadoMesFotosConteudo resumo={resumo} getEscolaLabel={getEscolaLabel} cnpj={cnpj} />
        </div>
      )}
    </div>
  );
}
