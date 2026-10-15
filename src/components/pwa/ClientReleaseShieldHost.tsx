"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import {
  isCooperadoInstantResumeEnabled,
  scheduleCooperadoPostInteractiveTask,
  scheduleStaffPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  bindClientReleaseShieldEvents,
  isForegroundShieldTrigger,
  runClientReleaseShield,
} from "@/lib/pwa/clientReleaseShield";
import { PWA_RELEASE_INTEGRITY_POLICY } from "@/lib/pwa/pwaReleaseIntegrityStrategy";
import { runClientReleaseIntegrityProbe } from "@/lib/pwa/pwaReleaseIntegrityProbe";
import { materializeCooperadoPwaSnapshotsForCurrentBuild } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import {
  isPwaColdStartWindow,
  shouldAutoAlignClientRelease,
  stripReleaseAlignQueryFromUrl,
} from "@/lib/pwa/clientRelease";

/** 1ª linha do bundle do shield: descarta snapshots PWA só quando `APP_BUILD_VERSION` mudou (O(1) se igual). */
if (typeof window !== "undefined") {
  materializeCooperadoPwaSnapshotsForCurrentBuild();
}

/**
 * Blindagem de release — garante que toda publicação na Vercel chegue ao runtime
 * (boot, foco, rede, BFCache, troca de aba via hook separado).
 */
export function ClientReleaseShieldHost() {
  const startedRef = useRef(false);
  const { user, accountUser } = useAuth();
  const cooperadoExperience = isCooperadoAppUser(accountUser ?? user);

  useEffect(() => {
    if (typeof window === "undefined" || startedRef.current) return;
    startedRef.current = true;
    stripReleaseAlignQueryFromUrl();
    if (!shouldAutoAlignClientRelease()) return;

    const kick = (trigger: string) => {
      if (isPwaColdStartWindow() && trigger !== "manual") return;
      if (cooperadoExperience) materializeCooperadoPwaSnapshotsForCurrentBuild();
      if (cooperadoExperience && isForegroundShieldTrigger(trigger)) {
        void runClientReleaseIntegrityProbe(`foreground:${trigger}`);
      }
      void runClientReleaseShield(trigger);
    };

    const startBoot = () => {
      if (isPwaColdStartWindow()) return;
      if (cooperadoExperience) materializeCooperadoPwaSnapshotsForCurrentBuild();
      kick("boot");
    };

    if (shouldAutoAlignClientRelease()) {
      const deferMs = cooperadoExperience
        ? PWA_RELEASE_INTEGRITY_POLICY.cooperadoDeferredShieldBootMs
        : PWA_RELEASE_INTEGRITY_POLICY.staffDeferredShieldBootMs;
      const deferBoot = () => window.setTimeout(startBoot, deferMs);
      if (cooperadoExperience) {
        scheduleCooperadoPostInteractiveTask(() => {
          void runClientReleaseIntegrityProbe("post_interactive", { bypassCache: true });
        });
        scheduleCooperadoPostInteractiveTask(deferBoot);
      } else {
        scheduleStaffPostInteractiveTask(deferBoot);
      }
    } else if (
      cooperadoExperience &&
      (isCooperadoPwaMessengerMode() || isCooperadoInstantResumeEnabled())
    ) {
      scheduleCooperadoPostInteractiveTask(startBoot);
    } else if (!cooperadoExperience) {
      scheduleStaffPostInteractiveTask(startBoot);
    } else {
      startBoot();
    }

    const unbind = bindClientReleaseShieldEvents(kick);
    return unbind;
  }, [cooperadoExperience]);

  return null;
}
