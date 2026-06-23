"use client";

import Link from "next/link";
import { FileCheck } from "lucide-react";
import type { AppData } from "@/types";
import {
  prestacaoExigeAtencaoCooperado,
  prestacaoPrincipalCooperado,
  resumoValoresPrestacao,
  tituloPrestacaoCooperado,
  TIPO_REPASSE_LABELS,
} from "@/services/prestacaoContasService";
import { formatCurrency } from "@/utils/format";

interface Props {
  data: AppData;
  cooperadoId: string;
  cooperativaId?: string;
}

function labelTipoRepasse(tipo: keyof typeof TIPO_REPASSE_LABELS | undefined): string {
  if (tipo && TIPO_REPASSE_LABELS[tipo]) return TIPO_REPASSE_LABELS[tipo];
  return "Repasse";
}

export function PrestacaoContasDashboardBanner({ data, cooperadoId, cooperativaId }: Props) {
  const prestacao = prestacaoPrincipalCooperado(data, cooperadoId, cooperativaId);
  if (!prestacao || !prestacaoExigeAtencaoCooperado(prestacao)) return null;

  const resumo = resumoValoresPrestacao(prestacao);
  const titulo = tituloPrestacaoCooperado(prestacao);

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <FileCheck size={28} className="text-violet-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-violet-900 text-lg">{titulo}</p>
          <p className="text-sm text-violet-800 mt-1">
            {labelTipoRepasse(prestacao.tipoRepasse)} · {prestacao.historico}
          </p>
          <div className="mt-3">
            <p className="text-2xl font-bold text-violet-900">
              {resumo.restante > 0
                ? formatCurrency(resumo.restante)
                : formatCurrency(0)}
            </p>
            <p className="text-sm text-violet-800 mt-0.5">
              {resumo.restante > 0 ? "Falta prestar" : "Aguardando conferência final"}
            </p>
          </div>
          {(resumo.abatido > 0 || resumo.notasAguardando > 0) && (
            <p className="text-xs text-violet-700/90 mt-2">
              {resumo.abatido > 0 && <>Lançado nas notas: {formatCurrency(resumo.abatido)}</>}
              {resumo.abatido > 0 && resumo.notasAguardando > 0 && " · "}
              {resumo.notasAguardando > 0 &&
                `${resumo.notasAguardando} nota(s) aguardando conferência`}
            </p>
          )}
          <Link
            href="/prestacao-contas"
            className="inline-flex items-center justify-center gap-2 mt-4 px-3 py-1.5 text-xs rounded-lg font-medium bg-green-700 hover:bg-green-800 text-white"
          >
            {resumo.notasAguardando > 0 ? "Ver prestação" : "Enviar fotos das notas"}
          </Link>
        </div>
      </div>
    </div>
  );
}
