"use client";

import { isHomologAppDeployment, homologLabShortName } from "@/lib/security/homologDeployment";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Faixa visível — deixa claro que não é o app oficial instalado no cooperado. */
export function HomologLabBanner() {
  if (!isHomologAppDeployment()) return null;
  return (
    <div
      className="shrink-0 bg-amber-500 text-amber-950 text-center text-xs sm:text-sm font-semibold px-3 py-1.5 border-b border-amber-600/40"
      role="status"
    >
      {homologLabShortName()} · ambiente de testes · v{APP_BUILD_VERSION} — não é o app oficial do
      cooperado
    </div>
  );
}
