"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  fetchOfficialClientRelease,
  requestManualCooperadoReleaseUpgrade,
} from "@/lib/pwa/fetchOfficialClientRelease";
import { readConfirmedClientReleaseBuild } from "@/lib/pwa/clientRelease";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";
import { cn } from "@/utils/format";

const POLL_WHEN_BEHIND_MS = 45_000;

/**
 * Build do bundle em execução + paridade com `/api/client-release`.
 * Se a nuvem estiver à frente, o chip vira botão «Atualizar» (hard align real).
 */
export function CooperadoMobileHeaderToolbar() {
  const bundleBuild = APP_BUILD_VERSION;
  const [pageBuild, setPageBuild] = useState(0);
  const [cloudBuild, setCloudBuild] = useState<number | null>(null);
  const [confirmedBuild, setConfirmedBuild] = useState<number | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshMeta = useCallback(async () => {
    const raw = document.documentElement.getAttribute("data-app-build") ?? "";
    const parsed = parseInt(raw, 10);
    setPageBuild(Number.isFinite(parsed) ? parsed : 0);
    setConfirmedBuild(readConfirmedClientReleaseBuild());

    const official = await fetchOfficialClientRelease();
    setCloudBuild(official?.build ?? null);

    const pageRaw = document.documentElement.getAttribute("data-app-build") ?? "";
    const pageN = parseInt(pageRaw, 10);
    const pageAhead = Number.isFinite(pageN) && pageN > bundleBuild;
    if (official && (official.build > bundleBuild || pageAhead)) {
      void runClientReleaseShield("header_cloud_ahead");
    }
  }, [bundleBuild]);

  useEffect(() => {
    void refreshMeta();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshMeta();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshMeta]);

  /** HTML da Vercel pode ser 273 enquanto o JS em cache ainda é 270 — chip verde enganava. */
  const behind =
    (cloudBuild != null && cloudBuild > bundleBuild) ||
    (pageBuild > 0 && pageBuild > bundleBuild);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!behind) return;
    pollRef.current = setInterval(() => {
      if (document.visibilityState === "visible") void refreshMeta();
    }, POLL_WHEN_BEHIND_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [behind, refreshMeta]);

  const onUpgrade = async () => {
    if (upgrading) return;
    setUpgrading(true);
    try {
      const started = await requestManualCooperadoReleaseUpgrade();
      if (!started) {
        await runClientReleaseShield("header_manual_fallback");
      }
    } finally {
      setUpgrading(false);
    }
  };

  const title = [
    `Bundle em execução v${bundleBuild}`,
    cloudBuild != null ? `Produção (nuvem) v${cloudBuild}` : "Nuvem: consultando…",
    pageBuild > 0 ? `HTML desta aba v${pageBuild}` : null,
    confirmedBuild != null
      ? `Confirmado com a nuvem v${confirmedBuild}`
      : behind
        ? "Toque para baixar a versão nova"
        : "Release ainda não confirmado",
  ]
    .filter(Boolean)
    .join(" · ");

  if (behind) {
    return (
      <button
        type="button"
        onClick={() => void onUpgrade()}
        disabled={upgrading}
        className={cn(
          "shrink-0 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm",
          "animate-pulse hover:bg-amber-600 disabled:opacity-70"
        )}
        aria-label={`Atualizar app para versão ${cloudBuild}`}
        title={title}
      >
        {upgrading ? "…" : `v${bundleBuild} → v${cloudBuild}`}
      </button>
    );
  }

  return (
    <span
      className="shrink-0 rounded-md bg-green-800 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
      aria-label={`Versão do app v${bundleBuild}`}
      title={title}
    >
      v{bundleBuild}
    </span>
  );
}
