"use client";

import { useEffect, useState } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { readConfirmedClientReleaseBuild } from "@/lib/pwa/clientRelease";

/**
 * Exibe só o build do bundle em execução (vNNN).
 * Tooltip diferencia documento HTML e release confirmado após alinhar com a nuvem.
 */
export function CooperadoMobileHeaderToolbar() {
  const bundleBuild = APP_BUILD_VERSION;
  const [pageBuild, setPageBuild] = useState(0);
  const [confirmedBuild, setConfirmedBuild] = useState<number | null>(null);

  useEffect(() => {
    const raw = document.documentElement.getAttribute("data-app-build") ?? "";
    const parsed = parseInt(raw, 10);
    setPageBuild(Number.isFinite(parsed) ? parsed : 0);
    setConfirmedBuild(readConfirmedClientReleaseBuild());
  }, []);

  const title = [
    `Bundle em execução v${bundleBuild}`,
    pageBuild > 0 ? `HTML desta aba v${pageBuild}` : null,
    confirmedBuild != null
      ? `Confirmado com a nuvem v${confirmedBuild}`
      : "Release ainda não confirmado (aguardando alinhamento)",
  ]
    .filter(Boolean)
    .join(" · ");

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
