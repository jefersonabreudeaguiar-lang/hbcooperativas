"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  launchCooperadoPwaBrowserWorkaround,
  shouldCooperadoPwaUseBrowserWorkaround,
  voltarCooperadoParaAppNormal,
} from "@/lib/pwa/cooperadoPwaBrowserWorkaround";
import { userToCloudProfile } from "@/lib/security/clientSession";

/**
 * No ícone PWA (standalone), abre o fluxo pwa-rescue → Chrome assim que o cooperado entra.
 */
export function CooperadoPwaBrowserWorkaroundAutoLaunch() {
  const { user, loading } = useAuth();
  const launchedRef = useRef(false);
  const [opening, setOpening] = useState(false);

  useLayoutEffect(() => {
    if (loading || launchedRef.current) return;
    if (!user || user.role !== "cooperado") return;
    if (!shouldCooperadoPwaUseBrowserWorkaround()) return;

    launchedRef.current = true;
    setOpening(true);
    void launchCooperadoPwaBrowserWorkaround(userToCloudProfile(user));
  }, [loading, user]);

  if (!opening) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-green-950/95 px-6 text-center text-white"
      role="status"
      aria-live="polite"
    >
      <p className="text-lg font-semibold">Abrindo no Chrome…</p>
      <p className="mt-2 text-sm text-green-100/90 max-w-xs">
        Use o navegador até o atalho do app voltar ao normal. Se o Chrome não abrir, toque em Atualizar no topo.
      </p>
      <button
        type="button"
        className="mt-4 rounded-lg border border-green-400/60 px-4 py-2 text-sm font-semibold text-green-50 hover:bg-green-900/50"
        onClick={() => voltarCooperadoParaAppNormal()}
      >
        Voltar para app normal
      </button>
    </div>
  );
}
