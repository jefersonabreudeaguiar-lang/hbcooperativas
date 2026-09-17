"use client";

import { useEffect, useState } from "react";
import { Pin, Repeat, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/utils/format";
import { getComunicadoAssunto, type ComunicadoExibicao } from "@/services/comunicadoService";
import { fetchComunicadoAudioPlayUrl } from "@/services/comunicadoAudioSync";
import {
  comunicadoMuralAindaVisivel,
  formatMuralExpiraLabel,
  MURAL_DURACAO_OPCOES,
} from "@/services/comunicadoMuralDuracao";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import type { ComunicadoCategoria } from "@/types";

const CATEGORIA_LABELS: Record<ComunicadoCategoria, string> = {
  financeiro: "Financeiro",
  reuniao: "Reunião",
  entrega: "Entrega",
  documentacao: "Documentação",
  aviso_geral: "Aviso Geral",
};

interface ComunicadoCardProps {
  comunicado: ComunicadoExibicao;
  compact?: boolean;
  actions?: React.ReactNode;
  /** Responsável: mostra duração / expiração no mural. */
  showMuralMeta?: boolean;
}

function ComunicadoAudioPlayer({ c }: { c: ComunicadoExibicao }) {
  const data = useAppData();
  const { user } = usePermissions();
  const [src, setSrc] = useState<string | undefined>(c.audioDataUrl);

  useEffect(() => {
    if (c.audioDataUrl?.trim()) {
      setSrc(c.audioDataUrl);
      return;
    }
    if (!c.audioStoragePath || !data || !user) {
      setSrc(undefined);
      return;
    }
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((x) => x.id === coopId);
    const cnpj = coop?.cnpj ? normalizeCnpj(coop.cnpj) : user.cooperativaCnpj ? normalizeCnpj(user.cooperativaCnpj) : "";
    if (cnpj.length !== 14) return;

    let cancelled = false;
    void fetchComunicadoAudioPlayUrl(cnpj, c).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [c, c.audioDataUrl, c.audioStoragePath, c.id, data, user]);

  if (!src && !c.audioStoragePath && !c.audioDataUrl) return null;

  return (
    <div className="mt-3 rounded-xl border border-green-200 bg-green-50/50 p-3">
      <p className="text-xs font-medium text-green-800 mb-2 flex items-center gap-1">
        <Volume2 size={14} /> Ouça o recado da cooperativa
      </p>
      {src ? (
        <audio controls src={src} className="w-full" preload="metadata" />
      ) : (
        <p className="text-xs text-gray-500">Carregando áudio…</p>
      )}
    </div>
  );
}

export function ComunicadoCard({ comunicado: c, compact, actions, showMuralMeta }: ComunicadoCardProps) {
  const assunto = getComunicadoAssunto(c);
  const muralDuracaoLabel =
    MURAL_DURACAO_OPCOES.find((o) => o.value === (c.muralDuracao ?? "24h"))?.label ?? "24 horas";
  const expiraLabel = formatMuralExpiraLabel(c);

  return (
    <Card className={c.fixado ? "border-amber-300 bg-amber-50/30" : ""}>
      <div className="flex items-start gap-3">
        {c.fixado && <Pin size={18} className="text-amber-500 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold text-gray-900 ${compact ? "text-sm" : ""}`}>{assunto}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {CATEGORIA_LABELS[c.categoria]}
            </span>
            {c.somenteDiretoria && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Diretoria</span>
            )}
            {(c.recorrente || c.virtual) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                <Repeat size={12} /> {c.recorrenteLabel ?? "Mensal"}
              </span>
            )}
          </div>

          {c.descricao?.trim() && (
            <p
              className={`text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap ${
                compact ? "text-sm line-clamp-3" : "text-sm"
              }`}
            >
              {c.descricao}
            </p>
          )}

          {(c.audioDataUrl || c.audioStoragePath) && <ComunicadoAudioPlayer c={c} />}

          {showMuralMeta && !c.recorrente && !c.virtual && (
            <p
              className={`text-xs mt-2 ${
                c.muralPublicadoEm && !comunicadoMuralAindaVisivel(c) ? "text-amber-700" : "text-gray-500"
              }`}
            >
              {c.muralPublicadoEm
                ? comunicadoMuralAindaVisivel(c)
                  ? `No mural do cooperado até ${expiraLabel ?? "—"}`
                  : `Expirou no mural em ${expiraLabel ?? "—"}`
                : `Permanecerá ${muralDuracaoLabel} no mural após enviar aos cooperados`}
            </p>
          )}

          <p className="text-xs text-gray-400 mt-3">
            {formatDate(c.data)} — {c.responsavel}
          </p>
        </div>
        {actions}
      </div>
    </Card>
  );
}
