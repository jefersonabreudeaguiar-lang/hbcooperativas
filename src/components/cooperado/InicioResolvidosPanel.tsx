"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { ItemResolvidoInicioCooperado } from "@/services/cooperadoInicioResolvidosService";
import { diasRestantesResolvidoInicio } from "@/services/cooperadoInicioResolvidosService";

interface Props {
  itens: ItemResolvidoInicioCooperado[];
}

export function InicioResolvidosPanel({ itens }: Props) {
  if (itens.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resolvido</p>
      <div className="space-y-2">
        {itens.map((item) => {
          const dias = diasRestantesResolvidoInicio(item.resolvidoEm);
          const conteudo = (
            <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50/80">
              <CheckCircle2 size={22} className="text-green-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-green-900">{item.titulo}</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                    Resolvido
                  </span>
                </div>
                <p className="text-sm text-green-800 mt-1">{item.subtitulo}</p>
                {dias > 0 && (
                  <p className="text-xs text-green-700/80 mt-1">
                    Some do início em {dias} dia{dias === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </div>
          );

          if (item.href) {
            return (
              <Link key={item.id} href={item.href} className="block hover:opacity-90 transition-opacity">
                {conteudo}
              </Link>
            );
          }

          return <div key={item.id}>{conteudo}</div>;
        })}
      </div>
    </section>
  );
}
