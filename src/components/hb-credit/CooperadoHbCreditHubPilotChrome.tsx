"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { cn } from "@/utils/format";
import { hbCooperadoHubPageDark } from "@/lib/hb-credit/hbCreditCooperadoUi";

const ATTR = "data-hb-credit-pilot-hub";

/** Modo escuro premium do hub HB Créditos — só piloto Jeferson. */
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
        "min-h-[100dvh] bg-gradient-to-b from-slate-950 via-emerald-950/95 to-slate-900",
        hbCooperadoHubPageDark
      )}
    >
      {children}
    </div>
  );
}
