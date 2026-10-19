"use client";

import { Camera, CreditCard, Receipt, Wallet } from "lucide-react";

export type CooperadoFinanceiroSecao = "resumo" | "ficha" | "creditos" | "fotos";

const SECOES: { id: CooperadoFinanceiroSecao; label: string; Icon: typeof Wallet }[] = [
  { id: "resumo", label: "Resumo", Icon: Wallet },
  { id: "ficha", label: "Ficha", Icon: Receipt },
  { id: "creditos", label: "HB Créditos", Icon: CreditCard },
  { id: "fotos", label: "Fotos", Icon: Camera },
];

export function CooperadoFinanceiroSecoesNav({
  value,
  onChange,
}: {
  value: CooperadoFinanceiroSecao;
  onChange: (secao: CooperadoFinanceiroSecao) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Seções do financeiro">
      {SECOES.map(({ id, label, Icon }) => {
        const ativa = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => onChange(id)}
            className={`px-3 py-2 text-sm font-medium rounded-xl border flex items-center gap-1.5 ${
              ativa
                ? "border-green-600 bg-green-50 text-green-800"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
