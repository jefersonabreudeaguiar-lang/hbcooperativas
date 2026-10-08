"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import {
  isCooperadoInstantResumeEnabled,
  scheduleCooperadoPostInteractiveTask,
  scheduleStaffPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";
import { applyOfficialReleaseIfNeeded } from "@/lib/pwa/fetchOfficialClientRelease";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

/** Um retry se chunks ainda não tinham dpl= no DOM. */
const PENDING_RETRY_MS = 1_500;

/**
 * Alinha o app à versão publicada na Vercel — só em eventos (boot / foco), sem polling.
 */
export function ClientDeploymentGuard() {
  const aligningRef = useRef(false);
  const { user, accountUser } = useAuth();
  const cooperadoExperience = isCooperadoAppUser(accountUser ?? user);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = async (): Promise<"stop" | "retry"> => {
      if (aligningRef.current) return "stop";
      const result = await applyOfficialReleaseIfNeeded();
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

    if (cooperadoExperience && isCooperadoPwaMessengerMode()) {
      queueMicrotask(start);
    } else if (cooperadoExperience && isCooperadoInstantResumeEnabled()) {
      scheduleCooperadoPostInteractiveTask(start);
    } else if (!cooperadoExperience) {
      scheduleStaffPostInteractiveTask(start);
    } else {
      start();
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible" || aligningRef.current) return;
      start();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (pendingRetryId) window.clearTimeout(pendingRetryId);
    };
  }, [cooperadoExperience]);

  return null;
}
