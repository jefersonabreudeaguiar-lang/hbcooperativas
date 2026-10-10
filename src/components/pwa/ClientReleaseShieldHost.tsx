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
  runClientReleaseShield,
} from "@/lib/pwa/clientReleaseShield";
import { materializeCooperadoPwaSnapshotsForCurrentBuild } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { shouldAutoAlignClientRelease, stripReleaseAlignQueryFromUrl } from "@/lib/pwa/clientRelease";

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
      if (cooperadoExperience) materializeCooperadoPwaSnapshotsForCurrentBuild();
      void runClientReleaseShield(trigger);
    };

    const startBoot = () => {
      if (cooperadoExperience) materializeCooperadoPwaSnapshotsForCurrentBuild();
      kick("boot");
    };

    if (
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
