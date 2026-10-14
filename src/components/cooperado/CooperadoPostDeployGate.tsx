"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { useCooperadoReleasePolicy } from "@/hooks/useCooperadoReleasePolicy";
import { cooperadoClientBuildMeetsMin } from "@/lib/cooperado/cooperadoReleasePolicy";
import {
  cooperadoNeedsPostDeployGate,
  cooperadoPostDeployReloadHref,
  runCooperadoPostDeployQueue,
  waitForCooperadoSyncSettled,
  type PostDeployGatePhase,
} from "@/lib/cooperado/cooperadoPostDeployQueue";
import { Button } from "@/components/ui/Button";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const PHASE_LABEL: Record<PostDeployGatePhase, string> = {
  idle: "Preparando…",
  reload_required: "Atualização obrigatória",
  waiting_policy: "Carregando…",
  sync_operacional: "Sincronizando com a cooperativa…",
  materializar_ui: "Atualizando A receber, Financeiro e HB Créditos…",
  done: "Pronto",
  error: "Não foi possível concluir",
};

/**
 * Cooperado: após deploy, garante bundle mínimo + fila operacional/HB antes do dashboard.
 */
export function CooperadoPostDeployGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { policy, loading, clientBuild } = useCooperadoReleasePolicy();
  const { syncingForUi, lastSyncedAt } = useSyncStatus();
  const [phase, setPhase] = useState<PostDeployGatePhase>("idle");
  const [error, setError] = useState("");
  const [released, setReleased] = useState(false);
  const runRef = useRef(false);
  const syncReadRef = useRef({ syncing: syncingForUi, lastSyncedAt });
  syncReadRef.current = { syncing: syncingForUi, lastSyncedAt };

  const cooperado = user?.role === "cooperado" && Boolean(user.cooperadoId);
  const needsGate =
    cooperado &&
    !released &&
    !loading &&
    policy &&
    cooperadoNeedsPostDeployGate(user, policy, clientBuild);

  const needsReload =
    cooperado && policy && !cooperadoClientBuildMeetsMin(clientBuild, policy);

  const runQueue = useCallback(async () => {
    if (!user || !policy || user.role !== "cooperado") return;
    setError("");
    const result = await runCooperadoPostDeployQueue({
      user,
      policy,
      onPhase: setPhase,
      waitForOperacionalSync: async () =>
        waitForCooperadoSyncSettled(() => syncReadRef.current),
    });
    if (result.ok) {
      setReleased(true);
      setPhase("done");
    } else {
      setPhase("error");
      setError(result.error);
    }
  }, [user, policy, syncingForUi, lastSyncedAt]);

  useEffect(() => {
    if (!cooperado || loading || !policy) return;
    if (released) return;
    if (needsReload) {
      setPhase("reload_required");
      return;
    }
    if (!needsGate) {
      setReleased(true);
      return;
    }
    if (runRef.current) return;
    runRef.current = true;
    void runQueue();
  }, [cooperado, loading, policy, needsGate, needsReload, released, runQueue]);

  if (!cooperado) {
    return <>{children}</>;
  }

  if (released && !needsReload) {
    return <>{children}</>;
  }

  if (!loading && policy && !needsGate && !needsReload) {
    return <>{children}</>;
  }

  const label = PHASE_LABEL[phase] ?? PHASE_LABEL.idle;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-green-950 to-green-900 px-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-green-200/90">HB Cooperativas</p>
      <h1 className="mt-3 text-xl font-bold sm:text-2xl">
        {needsReload ? "Atualize o aplicativo" : "Atualizando seus dados"}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-green-100/90">
        {needsReload
          ? `Seu app (v${clientBuild}) está abaixo da versão mínima (v${policy?.minBuild ?? "—"}). É necessário abrir a versão nova para todos os cooperados verem as mesmas correções.`
          : policy?.message ||
            "Sincronizando ficha, A receber, Financeiro e HB Créditos com a nuvem."}
      </p>
      <p className="mt-4 text-sm font-medium text-green-50">{label}</p>
      <p className="mt-1 text-[11px] tabular-nums text-green-200/80">
        App v{APP_BUILD_VERSION}
        {policy ? ` · release ${policy.releaseEpoch}` : ""}
      </p>

      {needsReload && policy && (
        <Button
          type="button"
          className="mt-6"
          size="lg"
          onClick={() => {
            window.location.href = cooperadoPostDeployReloadHref(policy);
          }}
        >
          Abrir versão v{policy.minBuild}
        </Button>
      )}

      {!needsReload && phase === "error" && (
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-sm text-amber-100">{error}</p>
          <Button
            type="button"
            variant="inverse"
            onClick={() => {
              runRef.current = false;
              void runQueue();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {!needsReload && phase !== "error" && phase !== "done" && (
        <div className="mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-white/80" />
        </div>
      )}
    </div>
  );
}
