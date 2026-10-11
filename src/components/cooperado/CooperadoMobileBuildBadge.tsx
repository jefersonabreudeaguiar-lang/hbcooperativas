"use client";

import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/**
 * Versão do bundle no celular do cooperado — só constante de build (sem AppData/sync).
 * Permanente para conferir atualização; não substitui a faixa pesada de sync.
 */
export function CooperadoMobileBuildBadge() {
  return (
    <span
      className="rounded-md bg-green-800/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-green-50 shrink-0"
      title={`Versão do app: ${APP_BUILD_VERSION}`}
      aria-label={`Versão ${APP_BUILD_VERSION}`}
    >
      v{APP_BUILD_VERSION}
    </span>
  );
}
