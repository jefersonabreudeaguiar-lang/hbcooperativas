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
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  getEmbeddedClientRelease,
  getPageEmbeddedReleaseFromDom,
  runtimeAlreadyOnCanonicalRelease,
} from "@/lib/pwa/clientRelease";

/** Um retry se chunks ainda não tinham dpl= no DOM. */
const PENDING_RETRY_MS = 1_500;
const COOPERADO_RELEASE_POLL_MS = 3 * 60 * 1000;

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
        if (coopUpgrade === "pending") return "retry";
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
      void fetchOfficialClientRelease().then((canonical) => {
        if (!canonical) return;
        const embedded = getEmbeddedClientRelease();
        const page = getPageEmbeddedReleaseFromDom();
        if (runtimeAlreadyOnCanonicalRelease(canonical, page, embedded)) return;
        void run();
      });
    };
    document.addEventListener("visibilitychange", onVisible);

    let interval = 0;
    void fetchOfficialClientRelease().then((canonical) => {
      if (!canonical) {
        if (!cancelled && cooperadoExperience) {
          interval = window.setInterval(() => {
            if (!aligningRef.current) void run();
          }, COOPERADO_RELEASE_POLL_MS);
        }
        return;
      }
      const embedded = getEmbeddedClientRelease();
      const page = getPageEmbeddedReleaseFromDom();
      const aligned = runtimeAlreadyOnCanonicalRelease(canonical, page, embedded);
      const intervalMs = aligned ? 0 : cooperadoExperience ? COOPERADO_RELEASE_POLL_MS : 2 * 60 * 1000;
      if (intervalMs > 0 && !cancelled) {
        interval = window.setInterval(() => {
          if (!aligningRef.current) void run();
        }, intervalMs);
      }
    });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (interval) window.clearInterval(interval);
      if (pendingRetryId) window.clearTimeout(pendingRetryId);
    };
  }, [cooperadoExperience]);

  return null;
}
