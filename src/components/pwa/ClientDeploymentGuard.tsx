"use client";

import { useEffect, useRef } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  collectLoadedDeploymentIdsFromDom,
  evaluateBuildGuard,
  evaluateDeploymentGuard,
  getHtmlEmbeddedAppBuild,
  getHtmlEmbeddedDeploymentId,
  hardReloadForNewRelease,
} from "@/lib/pwa/clientRelease";
import { fetchOfficialClientRelease, markClientReleaseSeen } from "@/lib/pwa/fetchOfficialClientRelease";

const RETRY_MS = [0, 400, 900, 1600, 2500, 4000, 6500, 10000];

/**
 * Impede permanência em chunks de deployment antigo (ex.: dpl_Eoe9… vs produção atual).
 * Complementa o script inline no layout (antes do React).
 */
export function ClientDeploymentGuard() {
  const checkingRef = useRef(false);
  const reloadTriggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const triggerReload = () => {
      if (reloadTriggeredRef.current) return;
      reloadTriggeredRef.current = true;
      hardReloadForNewRelease();
    };

    const run = async (): Promise<"done" | "retry"> => {
      if (checkingRef.current) return "retry";
      checkingRef.current = true;
      try {
        const official = await fetchOfficialClientRelease();
        const loaded = collectLoadedDeploymentIdsFromDom();
        const htmlDpl = getHtmlEmbeddedDeploymentId();
        const htmlBuild = getHtmlEmbeddedAppBuild();
        const prevDep = localStorage.getItem(DEPLOYMENT_SEEN_KEY);
        const prevBuild = localStorage.getItem(BUILD_SEEN_KEY);

        const buildDecision = evaluateBuildGuard({
          officialBuild: official.build,
          htmlBuild,
          previouslySeenBuild: prevBuild,
        });
        if (buildDecision.action === "reload") {
          triggerReload();
          return "done";
        }

        const decision = evaluateDeploymentGuard({
          official,
          loadedDeploymentIds: loaded,
          previouslySeenDeploymentId: prevDep,
          htmlDeploymentId: htmlDpl,
        });

        if (decision.action === "reload") {
          triggerReload();
          return "done";
        }

        if (decision.action === "pending") {
          return "retry";
        }

        if (loaded.length > 0 && official.build === APP_BUILD_VERSION) {
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
    }, 3 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, []);

  return null;
}
