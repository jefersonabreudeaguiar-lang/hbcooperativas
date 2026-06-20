"use client";

import { formatCurrency } from "@/utils/format";
import type { FichaCorridaDesconto } from "@/types";

interface ResumoDescontosMesProps {
  valorBruto: number;
  descontoCooperativa: number;
  descontoPadraoPct: number;
  valorEntregas: number;
  descontosExtras: FichaCorridaDesconto[];
  totalLiquido: number;
  rotuloTotal?: string;
  tema?: "claro" | "escuro";
}

export function ResumoDescontosMes({
  valorBruto,
  descontoCooperativa,
  descontoPadraoPct,
  valorEntregas,
  descontosExtras,
  totalLiquido,
  rotuloTotal = "A receber",
  tema = "claro",
}: ResumoDescontosMesProps) {
  const escuro = tema === "escuro";

  return (
    <div
      className={
        escuro
          ? "mt-4 text-sm text-green-100 space-y-1 border-t border-green-600/40 pt-3"
          : "rounded-xl bg-gray-50 p-4 text-sm space-y-1 border"
      }
    >
      <div className="flex justify-between">
        <span>Valor bruto das entregas</span>
        <span>{formatCurrency(valorBruto)}</span>
      </div>
      <div className={`flex justify-between ${escuro ? "" : "text-amber-700"}`}>
        <span>
          Desconto cooperativa
          {descontoPadraoPct > 0 && (
            <span className={escuro ? "opacity-80" : ""}> ({descontoPadraoPct}%)</span>
          )}
        </span>
        <span>- {formatCurrency(descontoCooperativa)}</span>
      </div>
      <div className="flex justify-between">
        <span>Entregas líquidas</span>
        <span>{formatCurrency(valorEntregas)}</span>
      </div>
      {descontosExtras.map((d, i) => (
        <div key={i} className={`flex justify-between ${escuro ? "" : "text-red-600"}`}>
          <span>{d.motivo}</span>
          <span>- {formatCurrency(d.valor)}</span>
        </div>
      ))}
      <div
        className={`flex justify-between font-bold text-base pt-2 border-t ${
          escuro
            ? "text-white border-green-600/30 mt-1"
            : "text-green-700 border-gray-200"
        }`}
      >
        <span>{rotuloTotal}</span>
        <span>{formatCurrency(totalLiquido)}</span>
      </div>
    </div>
  );
}
