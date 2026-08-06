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
import {
  getCooperativaCnpj,
  resolveCooperativaCnpj,
  resolveFotosNotaParaExibicao,
} from "@/services/notaPedidoCloudService";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { NotaFotoImg } from "@/components/ui/NotaFotoImg";
import { contarFotosEnviadasNota, contarFotosEnviadasNotas } from "@/utils/fotoEntrega";
import { normalizeCnpj } from "@/utils/cooperativa";
import { formatDate, formatMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";

interface CooperadoFichaFotosPanelProps {
  resumos: ResumoMesEntregasCooperado[];
  getEscolaLabel: (nota: NotaPedido) => string;
  cooperativaId?: string;
}

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
    <div
      className={cn(
        "grid gap-1 p-1",
        urls.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
      )}
    >
      {urls.map((foto, i) => (
        <NotaFotoImg
          key={`${nota.id}-foto-${i}`}
          src={foto}
          alt={`Foto ${i + 1} — ${nota.numeroNota}`}
          className="w-full rounded-lg object-cover max-h-80 bg-gray-100 min-h-[8rem]"
        />
      ))}
    </div>
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

function MesFotosSection({
  resumo,
  getEscolaLabel,
  cnpj,
  expandido,
  onToggle,
}: {
  resumo: ResumoMesEntregasCooperado;
  getEscolaLabel: (nota: NotaPedido) => string;
  cnpj?: string;
  expandido: boolean;
  onToggle: () => void;
}) {
  const entregas = useMemo(() => agruparNotasEmEntregas(resumo.notas), [resumo.notas]);
  const entregasComFoto = entregas.filter((e) =>
    e.notas.some((n) => contarFotosEnviadasNota(n) > 0)
  );
  const qtdFotos = contarFotosEnviadasNotas(resumo.notas);
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
      )}
    </div>
  );
}

export function CooperadoFichaFotosPanel({
  resumos,
  getEscolaLabel,
  cooperativaId,
}: CooperadoFichaFotosPanelProps) {
  const data = useAppData();
  const { user } = useAuth();
  const [cnpj, setCnpj] = useState<string | undefined>();

  useEffect(() => {
    if (!data) return;
    const local = cooperativaId ? getCooperativaCnpj(data, cooperativaId) : undefined;
    if (local) {
      setCnpj(local);
      return;
    }
    const fromUser = normalizeCnpj(user?.cooperativaCnpj ?? "");
    if (fromUser.length === 14) {
      setCnpj(fromUser);
      return;
    }
    let cancelled = false;
    void resolveCooperativaCnpj(data, cooperativaId, user).then((resolved) => {
      if (!cancelled) setCnpj(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [data, cooperativaId, user]);

  const mesesComFoto = useMemo(
    () => resumos.filter((r) => contarFotosEnviadasNotas(r.notas) > 0),
    [resumos]
  );
  const [mesExpandido, setMesExpandido] = useState<string | null>(
    mesesComFoto[0]?.mesReferencia ?? null
  );

  useEffect(() => {
    if (mesesComFoto.length > 0 && !mesesComFoto.some((m) => m.mesReferencia === mesExpandido)) {
      setMesExpandido(mesesComFoto[0]?.mesReferencia ?? null);
    }
  }, [mesesComFoto, mesExpandido]);

  const totalFotos = useMemo(
    () => mesesComFoto.reduce((s, r) => s + contarFotosEnviadasNotas(r.notas), 0),
    [mesesComFoto]
  );

  if (mesesComFoto.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border border-dashed">
        <Camera size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="font-semibold text-gray-800">Nenhuma foto enviada ainda</p>
        <p className="text-sm mt-2 max-w-sm mx-auto">
          As fotos das entregas que você enviar aparecerão aqui, organizadas por mês — em análise ou já
          lançadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-900">
        <strong>{totalFotos}</strong> foto{totalFotos !== 1 ? "s" : ""} em{" "}
        <strong>{mesesComFoto.length}</strong> mês{mesesComFoto.length !== 1 ? "es" : ""}. Toque no mês
        para ver todas as imagens — incluindo entregas aguardando conferência e as já lançadas.
      </div>

      <div className="space-y-3">
        {mesesComFoto.map((resumo) => (
          <MesFotosSection
            key={resumo.mesReferencia}
            resumo={resumo}
            getEscolaLabel={getEscolaLabel}
            cnpj={cnpj}
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
