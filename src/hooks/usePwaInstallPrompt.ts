"use client";

import { useCallback, useEffect, useState } from "react";
import { detectDevicePlatform } from "@/components/pwa/BaixarAppGuide";
import { markPwaRepairSessionForBuild } from "@/lib/pwa/cooperadoPwaInstallPrepare";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaInstallPromptState =
  | "standalone"
  | "waiting"
  | "ready"
  | "manual"
  | "ios";

export function usePwaInstallPrompt(prepareOnMount = true) {
  const [state, setState] = useState<PwaInstallPromptState>("waiting");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAppStandalone()) {
      setState("standalone");
      return;
    }

    const platform = detectDevicePlatform();
    if (platform === "ios") {
      setState("ios");
      return;
    }

    let cancelled = false;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (cancelled) return;
      setDeferred(e as BeforeInstallPromptEvent);
      setState("ready");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const fallback = window.setTimeout(() => {
      if (cancelled) return;
      setState((current) => (current === "waiting" ? "manual" : current));
    }, 4_000);

    if (prepareOnMount) {
      void import("@/lib/pwa/cooperadoPwaInstallPrepare").then(({ prepareBrowserProfileForPwaInstall }) =>
        prepareBrowserProfileForPwaInstall("install")
      );
    }

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.clearTimeout(fallback);
    };
  }, [prepareOnMount]);

  const install = useCallback(async () => {
    if (!deferred || installing) return false;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === "accepted") {
        markPwaRepairSessionForBuild();
        setState("standalone");
        return true;
      }
      return false;
    } catch {
      setDeferred(null);
      setState("manual");
      return false;
    } finally {
      setInstalling(false);
    }
  }, [deferred, installing]);

  return { state, installing, install, canInstall: state === "ready" && Boolean(deferred) };
}
