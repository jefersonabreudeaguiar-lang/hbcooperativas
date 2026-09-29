"use client";

import { useEffect, useRef } from "react";
import {
  collectLoadedDeploymentIdsFromDom,
  evaluateDeploymentGuard,
  getHtmlEmbeddedDeploymentId,
  hardReloadForNewRelease,
} from "@/lib/pwa/clientRelease";
import { fetchOfficialClientRelease, markClientReleaseSeen } from "@/lib/pwa/fetchOfficialClientRelease";

const RETRY_MS = [400, 900, 1600, 2500, 4000];

/**
 * Impede permanência em chunks de deployment antigo (ex.: dpl_Eoe9… vs produção atual).
 * Complementa o script inline no layout (antes do React).
 */
export function ClientDeploymentGuard() {
  const checkingRef = useRef(false);
  const reloadTriggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const triggerReload = (reason: string) => {
      if (reloadTriggeredRef.current) return;
      reloadTriggeredRef.current = true;
      hardReloadForNewRelease(reason);
    };

    const run = async (): Promise<"done" | "retry"> => {
      if (checkingRef.current) return "retry";
      checkingRef.current = true;
      try {
        const official = await fetchOfficialClientRelease();
        const loaded = collectLoadedDeploymentIdsFromDom();
        const htmlDpl = getHtmlEmbeddedDeploymentId();

        const decision = evaluateDeploymentGuard({
          official,
          loadedDeploymentIds: loaded,
          htmlDeploymentId: htmlDpl,
        });

        if (decision.action === "reload") {
          triggerReload(decision.reason);
          return "done";
        }

        if (decision.action === "pending") {
          return "retry";
        }

        if (loaded.length > 0) {
          markClientReleaseSeen(official);
        }

        return "done";
      } finally {
        checkingRef.current = false;
      }
    };

    let cancelled = false;
    const timeouts: number[] = [];

    const scheduleRetries = () => {
      for (const ms of RETRY_MS) {
        const id = window.setTimeout(() => {
          if (cancelled || reloadTriggeredRef.current) return;
          void run().then((next) => {
            if (next === "retry" && !reloadTriggeredRef.current && !cancelled) return;
          });
        }, ms);
        timeouts.push(id);
      }
    };

    void run().then((next) => {
      if (next === "retry") scheduleRetries();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible" && !reloadTriggeredRef.current) void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      if (!reloadTriggeredRef.current) void run();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, []);

  return null;
}
