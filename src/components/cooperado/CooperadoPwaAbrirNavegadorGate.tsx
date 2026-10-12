"use client";

import { useLayoutEffect, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/Button";
import {
  launchCooperadoPwaBrowserWorkaround,
  shouldShowCooperadoPwaAbrirNavegadorGate,
} from "@/lib/pwa/cooperadoPwaBrowserWorkaround";
import { userToCloudProfile } from "@/lib/security/clientSession";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

/** Ícone PWA: cooperado escolhe abrir o HB no navegador (sem redirect automático). */
export function CooperadoPwaAbrirNavegadorGate() {
  const { user, loading } = useAuth();

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
        Toque abaixo para abrir no navegador com seus dados atualizados.
      </p>
      <Button
        type="button"
        size="lg"
        variant="inverse"
        className="mt-8 w-full max-w-sm font-semibold text-base gap-2"
        onClick={() =>
          launchCooperadoPwaBrowserWorkaround(user ? userToCloudProfile(user) : null, {
            forceRetry: true,
          })
        }
      >
        <ExternalLink size={20} aria-hidden />
        Abrir no navegador
      </Button>
    </div>
  );
}
