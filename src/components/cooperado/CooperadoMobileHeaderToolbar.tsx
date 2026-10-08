"use client";

import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Cooperado mobile — apenas a versão do app (atualização é automática na publicação). */
export function CooperadoMobileHeaderToolbar() {
  return (
    <span
      className="shrink-0 rounded-md bg-green-800 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
      aria-label={`Versão do app v${APP_BUILD_VERSION}`}
    >
      v{APP_BUILD_VERSION}
    </span>
  );
}
