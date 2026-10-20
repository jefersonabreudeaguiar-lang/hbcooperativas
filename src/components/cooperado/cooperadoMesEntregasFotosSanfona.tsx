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
  urls,
  erro,
  carregando,
  onAbrirSequencia,
}: {
  nota: NotaPedido;
  urls: string[];
  erro: boolean;
  carregando: boolean;
  onAbrirSequencia: (indexNaNota: number) => void;
}) {
  if (carregando && urls.length === 0) {
    return (
      <div className="p-3 text-center text-sm text-gray-500 bg-gray-50 border-t border-gray-100">
        Carregando fotos…
      </div>
    );
  }
  if (erro && urls.length === 0) {
    return (
      <div className="p-3 text-center text-sm text-gray-500 bg-gray-50 border-t border-gray-100">
        Não foi possível carregar as fotos. Verifique a internet e abra de novo.
      </div>
    );
  }
  if (urls.length === 0) return null;

  return (
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
          onOpen={() => onAbrirSequencia(i)}
        />
      ))}
    </div>
  );
}

function EntregaFotoCard({
  entrega,
  getEscolaLabel,
  urlsPorNota,
  erroPorNota,
  carregando,
  onAbrirSequencia,
}: {
  entrega: EntregaCooperadoView;
  getEscolaLabel: (nota: NotaPedido) => string;
  urlsPorNota: Record<string, string[]>;
  erroPorNota: Record<string, boolean>;
  carregando: boolean;
  onAbrirSequencia: (notaId: string, indexNaNota: number) => void;
}) {
  const nota = entrega.notas[0];
  const status = statusEntregaCooperado(entrega);
  const escola = getEscolaLabel(nota);
  const qtdFotos = entrega.notas.reduce((s, n) => s + contarFotosEnviadasNota(n), 0);

  if (qtdFotos <= 0) return null;

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
          urls={urlsPorNota[n.id] ?? []}
          erro={!!erroPorNota[n.id]}
          carregando={carregando}
          onAbrirSequencia={(i) => onAbrirSequencia(n.id, i)}
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
  const notasComFoto = useMemo(
    () => entregasComFoto.flatMap((e) => e.notas.filter((n) => contarFotosEnviadasNota(n) > 0)),
    [entregasComFoto]
  );
  const semanas = useMemo(
    () => agruparEntregasPorSemanaNoMes(entregasComFoto, resumo.mesReferencia),
    [entregasComFoto, resumo.mesReferencia]
  );
  const [urlsPorNota, setUrlsPorNota] = useState<Record<string, string[]>>({});
  const [erroPorNota, setErroPorNota] = useState<Record<string, boolean>>({});
  const [carregando, setCarregando] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const notasKey = notasComFoto.map((n) => `${n.id}:${n.updatedAt}:${n.fotosEnviadasCount ?? 0}`).join("|");
  const cnpjMes = cnpj ?? (notasComFoto[0]?.cooperativaCnpj ? normalizeCnpj(notasComFoto[0].cooperativaCnpj) : undefined);

  useEffect(() => {
    if (notasComFoto.length === 0) {
      setUrlsPorNota({});
      setErroPorNota({});
      setCarregando(false);
      return;
    }
    let cancelled = false;
    setCarregando(true);
    void (async () => {
      const next: Record<string, string[]> = {};
      const erros: Record<string, boolean> = {};
      const blobs: string[] = [];
      for (const n of notasComFoto) {
        const resolved = await resolveFotosNotaParaExibicao(n, cnpjMes);
        if (cancelled) {
          for (const url of resolved) {
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          }
          return;
        }
        next[n.id] = resolved;
        erros[n.id] = resolved.length === 0 && contarFotosEnviadasNota(n) > 0;
        for (const url of resolved) {
          if (url.startsWith("blob:")) blobs.push(url);
        }
      }
      for (const old of blobUrlsRef.current) {
        if (old.startsWith("blob:")) URL.revokeObjectURL(old);
      }
      blobUrlsRef.current = blobs;
      setUrlsPorNota(next);
      setErroPorNota(erros);
      setCarregando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [notasKey, cnpjMes]);

  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      blobUrlsRef.current = [];
    };
  }, []);

  const sequencia = useMemo(() => {
    const items: { src: string; alt: string }[] = [];
    for (const n of notasComFoto) {
      const urls = urlsPorNota[n.id] ?? [];
      urls.forEach((src, i) => {
        items.push({ src, alt: `Foto ${i + 1} — ${n.numeroNota}` });
      });
    }
    return items;
  }, [notasComFoto, urlsPorNota]);

  const abrirSequencia = (notaId: string, indexNaNota: number) => {
    let idx = 0;
    for (const n of notasComFoto) {
      const urls = urlsPorNota[n.id] ?? [];
      if (n.id === notaId) {
        setLightboxIndex(idx + indexNaNota);
        return;
      }
      idx += urls.length;
    }
  };

  return (
    <div className="space-y-5">
      {sequencia.length > 1 && (
        <p className="text-xs text-gray-600">
          Toque numa foto para ampliar · {sequencia.length} fotos neste mês · passe para a próxima
        </p>
      )}
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
                urlsPorNota={urlsPorNota}
                erroPorNota={erroPorNota}
                carregando={carregando}
                onAbrirSequencia={abrirSequencia}
              />
            ))}
          </div>
        </div>
      ))}
      <FotoLightbox
        open={lightboxIndex !== null && sequencia.length > 0}
        items={sequencia}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
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
