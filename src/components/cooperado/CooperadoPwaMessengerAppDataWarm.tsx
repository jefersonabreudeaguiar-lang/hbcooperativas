"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { isAppDataWarm, preloadAppData } from "@/services/dataStore";

/** Após o shell pintar, carrega AppData em idle (sync/Atualizar precisa disso). */
export function CooperadoPwaMessengerAppDataWarm() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return;
    if (isAppDataWarm()) return;

    const run = () => {
      if (!isAppDataWarm()) preloadAppData({ eager: true });
    };

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 600);
    return () => window.clearTimeout(t);
  }, [user?.id, user?.role]);

  return null;
}
