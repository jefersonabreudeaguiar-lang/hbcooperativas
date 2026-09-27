"use client";

import { CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import type { EstadoQuantoVouReceberCooperado } from "@/services/cooperadoEntregasService";
import { formatCurrency } from "@/utils/format";
import type { FichaCorridaDesconto } from "@/types";

type Props = {
  estado: EstadoQuantoVouReceberCooperado;
  mesLabel: string;
  valorDestaque: number;
  tituloValor: string;
  subtitulo: string;
  acaoRotulo: string | null;
  onAcao?: () => void;
  mostrarDetalheCalculo?: boolean;
  detalheCalculo?: {
    valorBruto: number;
    descontoCooperativa: number;
    descontoPadraoPct: number;
    valorEntregas: number;
    descontosExtras: FichaCorridaDesconto[];
    totalLiquido: number;
  };
};

export function CooperadoQuantoVouReceberPainel({
  estado,
  mesLabel,
  valorDestaque,
  tituloValor,
  subtitulo,
  acaoRotulo,
  onAcao,
  mostrarDetalheCalculo,
  detalheCalculo,
}: Props) {
  const temaEscuro = estado === "a_receber" || estado === "aguardando_assinatura";

  if (estado === "carregando") {
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 mb-6 shadow-sm">
        <Wallet size={28} className="text-amber-600 mb-3" />
        <p className="text-sm font-semibold text-gray-900">{tituloValor}</p>
        <p className="text-sm text-gray-500 mt-2">{subtitulo}</p>
        <p className="text-xs text-gray-400 mt-3">{mesLabel}</p>
      </div>
    );
  }

  if (estado === "nada_pendente") {
    return null;
  }

  return (
    <div
      className={
        temaEscuro
          ? "bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 mb-6 shadow-sm"
          : "rounded-2xl border border-gray-200 bg-white p-6 mb-6 shadow-sm"
      }
    >
      <p className={temaEscuro ? "text-green-100 text-sm" : "text-gray-500 text-sm"}>
        {tituloValor} · {mesLabel}
      </p>
      <p className={`text-3xl sm:text-4xl font-bold mt-2 ${temaEscuro ? "" : "text-gray-900"}`}>
        {formatCurrency(valorDestaque)}
      </p>
      <p className={`text-sm mt-3 max-w-lg ${temaEscuro ? "text-green-100" : "text-gray-600"}`}>{subtitulo}</p>

      {estado === "aguardando_assinatura" && acaoRotulo && onAcao && (
        <Button
          className={`mt-4 w-full sm:w-auto ${temaEscuro ? "bg-white text-green-800 hover:bg-green-50" : ""}`}
          size="lg"
          onClick={onAcao}
        >
          <CheckCircle2 size={18} /> {acaoRotulo}
        </Button>
      )}

      {mostrarDetalheCalculo && detalheCalculo && (
        <div className={temaEscuro ? "mt-5 pt-4 border-t border-white/20" : "mt-5 pt-4 border-t border-gray-200"}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${temaEscuro ? "text-green-100" : "text-gray-500"}`}>
            Como foi calculado
          </p>
          <ResumoDescontosMes
            valorBruto={detalheCalculo.valorBruto}
            descontoCooperativa={detalheCalculo.descontoCooperativa}
            descontoPadraoPct={detalheCalculo.descontoPadraoPct}
            valorEntregas={detalheCalculo.valorEntregas}
            descontosExtras={detalheCalculo.descontosExtras}
            totalLiquido={detalheCalculo.totalLiquido}
            rotuloTotal={estado === "aguardando_assinatura" ? "Valor do recibo" : "Total a receber"}
            tema={temaEscuro ? "escuro" : "claro"}
          />
        </div>
      )}
    </div>
  );
}
