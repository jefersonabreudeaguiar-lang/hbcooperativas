"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { cooperadoMobilePilotSnapshotFirstInicio } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import {
  cooperadoPilotFinanceRecoveryOnForeground,
  scheduleCooperadoPilotFinanceReadRecovery,
} from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import {
  cancelCooperadoGaFinanceiroExibicaoRefresh,
  scheduleCooperadoGaFinanceiroExibicaoRefresh,
} from "@/lib/cooperado/cooperadoGaFinanceiroExibicaoRefreshSchedule";
import {
  cancelCooperadoGarantiaValorReceberSync,
  scheduleCooperadoGarantiaValorReceberUntilResolvido,
} from "@/lib/cooperado/cooperadoGaGarantiaValorReceberSync";
import {
  cancelCooperadoReleaseIntegrityWatch,
  scheduleCooperadoReleaseIntegrityWatch,
} from "@/lib/cooperado/cooperadoReleaseIntegrityWatch";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { persistirCooperadoPwaEntregasResumosSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import { persistirInicioCardCooperadoNotificarPwaLeve } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isAppDataWarm } from "@/services/dataStore";

/** Ao ir para segundo plano, grava snapshots — reabertura instantânea (estilo WhatsApp). */
export function CooperadoPwaResumeLifecycle() {
  const { user } = useAuth();

  useEffect(() => {
    if (
      !user ||
      user.role !== "cooperado" ||
      (!isCooperadoPwaMobileLeveUi() && !cooperadoMobilePilotSnapshotFirstInicio(user))
    ) {
      return;
    }

    if (cooperadoMobilePilotSnapshotFirstInicio(user)) {
      scheduleCooperadoPilotFinanceReadRecovery(user);
    }
    if (isCooperadoMobileGaPromoted(user)) {
      scheduleCooperadoGaFinanceiroExibicaoRefresh(user);
      scheduleCooperadoGarantiaValorReceberUntilResolvido(user);
      scheduleCooperadoReleaseIntegrityWatch(user);
    }

    const flush = () => {
      if (!isAppDataWarm()) return;
      persistirInicioCardCooperadoNotificarPwaLeve(user);
      persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, true);
      persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);
      persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && isCooperadoMobileGaPromoted(user)) {
        cooperadoPilotFinanceRecoveryOnForeground(user);
      }
      if (document.visibilityState === "hidden") flush();
    };

    const onPageHide = () => flush();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      cancelCooperadoGaFinanceiroExibicaoRefresh();
      cancelCooperadoGarantiaValorReceberSync();
      cancelCooperadoReleaseIntegrityWatch();
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);

  return null;
}
