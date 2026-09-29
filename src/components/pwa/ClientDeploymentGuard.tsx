"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  BUILD_SEEN_KEY,
  DEPLOYMENT_SEEN_KEY,
  collectLoadedDeploymentIdsFromDom,
  evaluateDeploymentGuard,
  hardReloadForNewRelease,
} from "@/lib/pwa/clientRelease";
import { fetchOfficialClientRelease, markClientReleaseSeen } from "@/lib/pwa/fetchOfficialClientRelease";

/**
 * Impede permanência em chunks de deployment antigo (ex.: dpl_Eoe9… vs produção dpl_7MX5…).
 */
export function ClientDeploymentGuard() {
  const { user } = useAuth();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const official = await fetchOfficialClientRelease();
        const loaded = collectLoadedDeploymentIdsFromDom();
        const prevDep = localStorage.getItem(DEPLOYMENT_SEEN_KEY);
        const prevBuild = localStorage.getItem(BUILD_SEEN_KEY);

        const decision = evaluateDeploymentGuard({
          official,
          loadedDeploymentIds: loaded,
          previouslySeenDeploymentId: prevDep,
        });

        if (decision.action === "reload") {
          hardReloadForNewRelease();
          return;
        }

        if (prevBuild != null && prevBuild !== String(official.build)) {
          if (user?.role === "cooperado") {
            hardReloadForNewRelease();
            return;
          }
        }

        markClientReleaseSeen(official);
      } finally {
        checkingRef.current = false;
      }
    };

    void run();

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void run(), 5 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [user?.role]);

  return null;
}
