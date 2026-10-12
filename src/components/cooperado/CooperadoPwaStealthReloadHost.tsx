"use client";

import { useLayoutEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  COOPERADO_PWA_STEALTH_RELOAD_ENABLED,
  COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY,
} from "@/lib/pwa/cooperadoPwaStealthReload";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

/** Fallback se o inline do <head> não rodar (HTML parcial). */
export function CooperadoPwaStealthReloadHost() {
  const { user, loading } = useAuth();

  useLayoutEffect(() => {
    if (!COOPERADO_PWA_STEALTH_RELOAD_ENABLED || loading) return;
    if (!user || user.role !== "cooperado") return;
    if (!isAppStandalone()) return;

    try {
      if (sessionStorage.getItem(COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY) === "done") return;
      sessionStorage.setItem(COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY, "done");
    } catch {
      return;
    }

    window.location.reload();
  }, [loading, user?.id, user?.role]);

  return null;
}
