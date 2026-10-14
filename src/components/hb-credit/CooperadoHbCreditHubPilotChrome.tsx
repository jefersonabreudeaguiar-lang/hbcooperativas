"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { cn } from "@/utils/format";
import { hbCooperadoHubPage } from "@/lib/hb-credit/hbCreditCooperadoUi";

const ATTR = "data-hb-credit-pilot-hub";

/** Shell do hub HB Créditos no piloto — fundo claro (alinhado ao Início do app). */
export function CooperadoHbCreditHubPilotChrome({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    if (!enabled) return;
    document.documentElement.setAttribute(ATTR, "1");
    return () => {
      document.documentElement.removeAttribute(ATTR);
    };
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className={cn(
        "min-h-[100dvh] bg-gradient-to-b from-emerald-50 via-green-50/95 to-white text-gray-900",
        hbCooperadoHubPage
      )}
    >
      {children}
    </div>
  );
}
