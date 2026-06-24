"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { ComunicadoCard } from "@/components/comunicado/ComunicadoCard";
import type { ComunicadoExibicao } from "@/services/comunicadoService";

interface AvisosInicioSectionProps {
  comunicados: ComunicadoExibicao[];
  hideWhenEmpty?: boolean;
}

export function AvisosInicioSection({ comunicados, hideWhenEmpty }: AvisosInicioSectionProps) {
  if (comunicados.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-3">
          <Megaphone size={14} className="text-green-700" />
          Avisos
        </p>
        <p className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-xl">
          Nenhum recado publicado no momento.
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-3">
        <Megaphone size={14} className="text-green-700" />
        Avisos
      </p>
      <div className="space-y-4">
        {comunicados.map((c) =>
          c.href ? (
            <Link key={c.id} href={c.href} className="block hover:opacity-95 transition-opacity">
              <ComunicadoCard comunicado={c} />
            </Link>
          ) : (
            <ComunicadoCard key={c.id} comunicado={c} />
          )
        )}
      </div>
    </section>
  );
}
