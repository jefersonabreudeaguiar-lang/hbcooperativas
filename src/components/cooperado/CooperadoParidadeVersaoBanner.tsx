"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import { Button } from "@/components/ui/Button";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";
import { BUILD_SEEN_KEY } from "@/lib/pwa/clientRelease";

/**
 * Cooperado: aviso explícito quando o aparelho está em build antigo (PWA/cache).
 * Complementa o reload automático do release shield.
 */
export function CooperadoParidadeVersaoBanner() {
  const { user, accountUser } = useAuth();
  const cooperado = isCooperadoAppUser(accountUser ?? user);
  const [cloudBuild, setCloudBuild] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const recheck = useCallback(async () => {
    if (!cooperado) return;
    const official = await fetchOfficialClientRelease();
    setCloudBuild(official?.build ?? null);
  }, [cooperado]);

  useEffect(() => {
    if (!cooperado) return;
    void recheck();
    const onVis = () => {
      if (document.visibilityState === "visible") void recheck();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cooperado, recheck]);

  if (!cooperado || cloudBuild == null) return null;

  let seenBuild = APP_BUILD_VERSION;
  try {
    const raw = localStorage.getItem(BUILD_SEEN_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) seenBuild = n;
  } catch {
    /* ignore */
  }

  const behind = cloudBuild > APP_BUILD_VERSION || cloudBuild > seenBuild;
  if (!behind) return null;

  const atualizar = async () => {
    setBusy(true);
    try {
      await runClientReleaseShield("paridade_banner");
    } finally {
      setBusy(false);
      void recheck();
    }
  };

  return (
    <div
      className="fixed inset-x-0 z-[95] px-3 pointer-events-none"
      style={{ bottom: "var(--hb-mobile-tab-bar-height, 5rem)" }}
    >
      <div
        className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-amber-300 bg-amber-50 shadow-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
        role="alert"
      >
        <p className="text-sm text-amber-950 flex-1">
          <strong>Atualização disponível</strong> — seu app está na versão{" "}
          <span className="tabular-nums">{APP_BUILD_VERSION}</span> e a cooperativa já usa a{" "}
          <span className="tabular-nums">{cloudBuild}</span>. Toque para todos verem o mesmo resultado.
        </p>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto shrink-0"
          disabled={busy}
          onClick={() => void atualizar()}
        >
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
          Atualizar agora
        </Button>
      </div>
    </div>
  );
}
