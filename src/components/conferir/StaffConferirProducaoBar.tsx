"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  fetchOfficialClientRelease,
  requestManualStaffReleaseUpgrade,
} from "@/lib/pwa/fetchOfficialClientRelease";
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { requestAppSyncImmediate } from "@/services/syncRequest";
import { cn } from "@/utils/format";

type CloudRelease = { build: number; sha: string; dpl: string };

/**
 * Prova na tela do Conferir (contrato v461): este aparelho vs produção real.
 * Chrome do responsável NÃO dá hard-reload sozinho — sem o clique a aba antiga
 * fica e parece que o deploy não entrou.
 */
export function StaffConferirProducaoBar() {
  const [cloud, setCloud] = useState<CloudRelease | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const official = await fetchOfficialClientRelease({ bypassCache: true });
      if (cancelled || !official) return;
      setCloud({
        build: official.build,
        sha: (official.gitCommitSha ?? "").slice(0, 7),
        dpl: (official.deploymentId ?? "").slice(0, 18),
      });
    };
    void pull();
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(pull, 45_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, []);

  const behind = cloud != null && cloud.build > APP_BUILD_VERSION;
  const aligned = cloud != null && cloud.build === APP_BUILD_VERSION;

  const atualizarAgora = async () => {
    if (busy) return;
    setBusy(true);
    resetResponsavelPainelIndexCache();
    requestAppSyncImmediate();
    try {
      await requestManualStaffReleaseUpgrade();
    } finally {
      window.setTimeout(() => setBusy(false), 8_000);
    }
  };

  const cloudTag = cloud
    ? `v${cloud.build}${cloud.sha ? ` · ${cloud.sha}` : ""}${cloud.dpl ? ` · ${cloud.dpl}` : ""}`
    : "";

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
        behind
          ? "border-red-300 bg-red-50 text-red-950"
          : aligned
            ? "border-green-200 bg-green-50 text-green-950"
            : "border-gray-200 bg-gray-50 text-gray-800"
      )}
      role="status"
      aria-live="polite"
      data-testid="staff-conferir-producao-bar"
    >
      <p className="min-w-0 flex-1 font-medium">
        {behind
          ? `Chrome do responsável está em v${APP_BUILD_VERSION}. Produção real é ${cloudTag}. Esta aba não atualiza sozinha — clique para entrar.`
          : aligned
            ? `Ao vivo produção ${cloudTag} — o que você vê é o build publicado.`
            : `App v${APP_BUILD_VERSION} · conferindo produção…`}
      </p>
      <button
        type="button"
        onClick={() => void atualizarAgora()}
        disabled={busy}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-70",
          behind ? "bg-red-700 hover:bg-red-800" : "bg-green-700 hover:bg-green-800"
        )}
      >
        <RefreshCw size={14} className={cn(busy && "animate-spin")} aria-hidden />
        {behind ? "Atualizar agora" : "Atualizar tela"}
      </button>
    </div>
  );
}
