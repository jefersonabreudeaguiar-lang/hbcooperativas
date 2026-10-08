"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getCooperadoScopedReadModelRevision } from "@/lib/cooperado/cooperadoScopedReadModels";
import { COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

/** Re-render leve quando snapshots cooperado são materializados (sem subscribe global no AppData). */
export function useCooperadoMessengerReadModelRevision(): number {
  const { user } = useAuth();
  const [revision, setRevision] = useState(-1);

  const readRevision = useCallback(() => {
    if (!user || user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) {
      setRevision(-1);
      return;
    }
    const data = getData();
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) {
      setRevision(-1);
      return;
    }
    const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    setRevision(getCooperadoScopedReadModelRevision(canon, coopId));
  }, [user]);

  useEffect(() => {
    if (!isCooperadoPwaMessengerMode()) return;
    readRevision();
    const onRefresh = () => readRevision();
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
  }, [readRevision]);

  return revision;
}
