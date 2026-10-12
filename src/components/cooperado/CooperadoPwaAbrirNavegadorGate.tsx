"use client";

import { useLayoutEffect, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { AppIcon } from "@/components/ui/AppIcon";
import {
  cooperadoPwaBrowserEntryAbsoluteUrl,
  shouldShowCooperadoPwaAbrirNavegadorGate,
} from "@/lib/pwa/cooperadoPwaBrowserWorkaround";
import { userToCloudProfile, ensureCloudSessionReady } from "@/lib/security/clientSession";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { cn } from "@/utils/format";

/** Ícone PWA: cooperado toca e abre o link de produção no Chrome (nova aba). */
export function CooperadoPwaAbrirNavegadorGate() {
  const { user, loading } = useAuth();
  const entryUrl = useMemo(() => cooperadoPwaBrowserEntryAbsoluteUrl(), []);

  const visible = useMemo(() => {
    if (loading) return shouldShowCooperadoPwaAbrirNavegadorGate(null);
    return shouldShowCooperadoPwaAbrirNavegadorGate(user?.role);
  }, [loading, user?.role]);

  useLayoutEffect(() => {
    if (visible) dismissCooperadoBootShell();
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-gradient-to-b from-green-900 to-green-950 px-6 text-center text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cooperado-pwa-abrir-navegador-titulo"
    >
      <AppIcon size="2xl" className="mb-6 shadow-lg rounded-2xl" />
      <h1 id="cooperado-pwa-abrir-navegador-titulo" className="text-xl font-bold">
        HB Cooperativas
      </h1>
      <p className="mt-2 max-w-xs text-sm text-green-100/90 leading-relaxed">
        Toque abaixo para abrir no navegador.
      </p>
      <a
        href={entryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-8 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl",
          "bg-white px-6 py-3.5 text-base font-semibold text-green-900 shadow-lg",
          "hover:bg-green-50 active:scale-[0.98] transition-transform"
        )}
        onClick={() => {
          void ensureCloudSessionReady(user ? userToCloudProfile(user) : undefined);
        }}
      >
        <ExternalLink size={20} aria-hidden />
        Abrir no navegador
      </a>
    </div>
  );
}
