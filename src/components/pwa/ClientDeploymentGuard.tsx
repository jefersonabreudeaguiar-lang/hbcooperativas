"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import {
  isCooperadoInstantResumeEnabled,
  scheduleCooperadoPostInteractiveTask,
  scheduleStaffPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";
import { ensureCooperadoReleaseUpgrade, runClientReleaseAlignment } from "@/lib/pwa/fetchOfficialClientRelease";
import {
  getEmbeddedClientRelease,
  getPageEmbeddedReleaseFromDom,
  runtimeAlreadyOnCanonicalRelease,
} from "@/lib/pwa/clientRelease";

/** Um retry se chunks ainda não tinham dpl= no DOM. */
const PENDING_RETRY_MS = 1_500;

export function ClientDeploymentGuard() {
  const aligningRef = useRef(false);
  const { user, accountUser } = useAuth();
  const cooperadoExperience = isCooperadoAppUser(accountUser ?? user);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = async (): Promise<"stop" | "retry"> => {
      if (aligningRef.current) return "stop";

      if (cooperadoExperience) {
        const coopUpgrade = await ensureCooperadoReleaseUpgrade(true);
        if (coopUpgrade === "aligning") {
          aligningRef.current = true;
        }
        return "stop";
      }

      const result = await runClientReleaseAlignment({ staffExperience: true });
      if (result === "aligning") {
        aligningRef.current = true;
        return "stop";
      }
      if (result === "pending") return "retry";
      return "stop";
    };

    let cancelled = false;
    let pendingRetryId = 0;

    const start = () => {
      void run().then((next) => {
        if (next !== "retry" || cancelled || aligningRef.current) return;
        pendingRetryId = window.setTimeout(() => {
          if (cancelled || aligningRef.current) return;
          void run();
        }, PENDING_RETRY_MS);
      });
    };

    if (cooperadoExperience && isCooperadoInstantResumeEnabled()) {
      scheduleCooperadoPostInteractiveTask(start);
    } else if (!cooperadoExperience) {
      scheduleStaffPostInteractiveTask(start);
    } else {
      start();
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible" || aligningRef.current) return;
      const embedded = getEmbeddedClientRelease();
      const page = getPageEmbeddedReleaseFromDom();
      if (runtimeAlreadyOnCanonicalRelease(embedded, page)) return;
      void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    const embedded = getEmbeddedClientRelease();
    const page = getPageEmbeddedReleaseFromDom();
    const skipPeriodic = runtimeAlreadyOnCanonicalRelease(embedded, page);
    const intervalMs = skipPeriodic ? 0 : cooperadoExperience ? 90 * 1000 : 2 * 60 * 1000;
    const interval =
      intervalMs > 0
        ? window.setInterval(() => {
            if (!aligningRef.current) void run();
          }, intervalMs)
        : 0;

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (interval) window.clearInterval(interval);
      if (pendingRetryId) window.clearTimeout(pendingRetryId);
    };
  }, [cooperadoExperience]);

  return null;
}
