"use client";

import Link from "next/link";
import { FileCheck } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import {
  prestacaoPrincipalCooperado,
  valorRestantePrestacao,
  TIPO_REPASSE_LABELS,
} from "@/services/prestacaoContasService";
import { formatCurrency } from "@/utils/format";

interface Props {
  cooperadoId: string;
  cooperativaId?: string;
}

export function PrestacaoContasDashboardBanner({ cooperadoId, cooperativaId }: Props) {
  const data = useAppData();
  if (!data) return null;

  const prestacao = prestacaoPrincipalCooperado(data, cooperadoId, cooperativaId);
  if (!prestacao) return null;

  const restante = valorRestantePrestacao(prestacao);
  const temNotas = (prestacao.notas ?? []).some((n) => n.fotoDataUrl || n.fotoMiniatura);
  const parcial = prestacao.valorConferido > 0 && restante > 0;

  if (prestacao.status === "conferida" || restante <= 0) return null;

  const titulo = parcial
    ? "Falta prestar conta do restante"
    : temNotas
      ? "Notas enviadas — aguardando conferência"
      : "Presta conta";

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <FileCheck size={28} className="text-violet-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-violet-900 text-lg">{titulo}</p>
          <p className="text-sm text-violet-800 mt-1">
            {TIPO_REPASSE_LABELS[prestacao.tipoRepasse]} · {prestacao.historico}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
            <span>
              Repasse: <strong>{formatCurrency(prestacao.valorRepasse)}</strong>
            </span>
            {parcial && (
              <>
                <span>
                  Conferido: <strong>{formatCurrency(prestacao.valorConferido)}</strong>
                </span>
                <span className="text-amber-800 font-semibold">
                  Falta: {formatCurrency(restante)}
                </span>
              </>
            )}
            {!parcial && !temNotas && (
              <span className="font-semibold text-violet-900">
                Valor: {formatCurrency(prestacao.valorRepasse)}
              </span>
            )}
          </div>
          <Link
            href="/prestacao-contas"
            className="inline-flex items-center justify-center gap-2 mt-4 px-3 py-1.5 text-xs rounded-lg font-medium bg-green-700 hover:bg-green-800 text-white"
          >
            {temNotas ? "Ver prestação" : "Enviar fotos das notas"}
          </Link>
        </div>
      </div>
    </div>
  );
}
