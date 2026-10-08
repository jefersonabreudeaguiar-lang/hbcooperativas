"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaEntregasResumosSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import { persistirInicioCardCooperadoNotificarPwaLeve } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isAppDataWarm } from "@/services/dataStore";

/** Ao ir para segundo plano, grava snapshots — reabertura instantânea (estilo WhatsApp). */
export function CooperadoPwaResumeLifecycle() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isCooperadoPwaMobileLeveUi()) return;

    const flush = () => {
      if (!isAppDataWarm()) return;
      persistirInicioCardCooperadoNotificarPwaLeve(user);
      persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
      persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    const onPageHide = () => flush();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);

  return null;
}
