"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { rematerializarCooperadoPwaSnapshotsSeNecessario } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { scheduleCooperadoPaintFirst } from "@/lib/performance/cooperadoColdStart";
import { isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";

/** Após o shell pintar, carrega AppData em idle (sync/Atualizar precisa disso). */
export function CooperadoPwaMessengerAppDataWarm() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
    if (isAppDataWarm()) return;

    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const run = () => {
      const hydrate = () => rematerializarCooperadoPwaSnapshotsSeNecessario(user);
      if (!isAppDataWarm()) {
        preloadAppData({ eager: true });
        void waitForAppDataWarm().then((ok) => {
          if (ok) hydrate();
        });
        return;
      }
      hydrate();
    };

    scheduleCooperadoPaintFirst(() => {
      if (typeof requestIdleCallback !== "undefined") {
        idleId = requestIdleCallback(run, { timeout: 900 });
      } else {
        timeoutId = window.setTimeout(run, 80);
      }
    });

    return () => {
      if (typeof requestIdleCallback !== "undefined" && idleId !== undefined) {
        cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [user?.id, user?.role]);

  return null;
}
