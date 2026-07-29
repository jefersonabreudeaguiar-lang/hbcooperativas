"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, Wallet, CreditCard, PenLine, FileText } from "lucide-react";
import type { FilaDoDiaItem } from "@/services/filaDoDiaService";
import { cn } from "@/utils/format";

const ICONS: Record<string, React.ReactNode> = {
  conferir: <ClipboardList size={20} className="text-amber-700" />,
  pagar: <Wallet size={20} className="text-green-700" />,
  mensalidades: <CreditCard size={20} className="text-blue-700" />,
  assinaturas: <PenLine size={20} className="text-violet-700" />,
  contratos: <FileText size={20} className="text-gray-600" />,
};

const URGENCIA_BORDER: Record<FilaDoDiaItem["urgencia"], string> = {
  alta: "border-l-amber-500",
  media: "border-l-blue-500",
  baixa: "border-l-gray-300",
};

export function FilaDoDiaPanel({ items }: { items: FilaDoDiaItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50/60 px-5 py-6">
        <p className="font-semibold text-green-900">Fila do dia limpa</p>
        <p className="text-sm text-green-800 mt-1">
          Nada urgente agora. Quando houver entregas, pagamentos ou comprovantes, eles aparecem aqui.
        </p>
      </div>
    );
  }

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Fila do dia</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            {total} {total === 1 ? "pendência" : "pendências"} que pedem ação
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 border-l-4 hover:border-green-300 hover:bg-green-50/40 transition-colors",
                URGENCIA_BORDER[item.urgencia]
              )}
            >
              <span className="shrink-0 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                {ICONS[item.id] ?? <ClipboardList size={20} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{item.titulo}</span>
                  <span className="text-xs font-bold bg-gray-900 text-white px-1.5 py-0.5 rounded-full tabular-nums">
                    {item.count}
                  </span>
                </span>
                <span className="block text-sm text-gray-500 mt-0.5 truncate">{item.detalhe}</span>
              </span>
              <ChevronRight size={18} className="text-gray-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
