"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ComunicadoCard } from "@/components/comunicado/ComunicadoCard";
import type { ComunicadoExibicao } from "@/services/comunicadoService";

interface MuralComunicadosProps {
  comunicados: ComunicadoExibicao[];
  limite?: number;
  verTodosHref?: string;
  hideWhenEmpty?: boolean;
}

export function MuralComunicados({ comunicados, limite, verTodosHref = "/comunicados", hideWhenEmpty }: MuralComunicadosProps) {
  const lista = limite ? comunicados.slice(0, limite) : comunicados;

  if (lista.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card title="Mural da cooperativa" className="border-dashed">
        <p className="text-sm text-gray-500 text-center py-6">Nenhum recado publicado no momento.</p>
      </Card>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
          <Megaphone size={14} className="text-green-700" />
          Mural da cooperativa
        </p>
        {verTodosHref && comunicados.length > (limite ?? comunicados.length) && (
          <Link href={verTodosHref} className="text-sm font-medium text-green-700 hover:text-green-800">
            Ver todos
          </Link>
        )}
      </div>
      <div className="space-y-4">
        {lista.map((c) =>
          c.href ? (
            <Link key={c.id} href={c.href} className="block hover:opacity-95 transition-opacity">
              <ComunicadoCard comunicado={c} />
            </Link>
          ) : (
            <ComunicadoCard key={c.id} comunicado={c} />
          )
        )}
      </div>
      {verTodosHref && limite && comunicados.length > limite && (
        <Link
          href={verTodosHref}
          className="block text-center text-sm font-medium text-green-700 hover:text-green-800 mt-4"
        >
          Ver todos os recados ({comunicados.length})
        </Link>
      )}
    </section>
  );
}
