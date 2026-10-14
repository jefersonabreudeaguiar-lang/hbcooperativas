"use client";

import { hbCooperadoHeroCard, hbCooperadoHeroGlow } from "@/lib/hb-credit/hbCreditCooperadoUi";
import { cn } from "@/utils/format";

/** Placeholder leve — piloto Jeferson enquanto busca conta (sem PageSkeleton pesado). */
export function HbCreditCooperadoLoadingShellPilot() {
  return (
    <div className={cn("px-4 animate-pulse pt-1")}>
      <div className="h-4 w-24 rounded bg-emerald-100" />
      <div className="mt-2 h-8 w-40 rounded bg-gray-200" />
      <div className={cn(hbCooperadoHeroCard, "mt-4 h-36")}>
        <span className={hbCooperadoHeroGlow} aria-hidden />
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">Abrindo HB Créditos…</p>
    </div>
  );
}
