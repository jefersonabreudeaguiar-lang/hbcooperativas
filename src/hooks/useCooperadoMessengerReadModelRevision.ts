"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import type { User } from "@/types";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getCooperadoScopedReadModelRevision } from "@/lib/cooperado/cooperadoScopedReadModels";
import { COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

function readCooperadoMessengerRevisionForUser(user: Omit<User, "password"> | null | undefined): number {
  if (!user || user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return -1;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return -1;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  return getCooperadoScopedReadModelRevision(canon, coopId);
}

/** Re-render leve quando snapshots cooperado são materializados (sem subscribe global no AppData). */
export function useCooperadoMessengerReadModelRevision(): number {
  const { user } = useAuth();
  const [revision, setRevision] = useState(-1);

  const revisionSync = useMemo(() => readCooperadoMessengerRevisionForUser(user), [user]);

  const readRevision = useCallback(() => {
    if (!isCooperadoPwaMessengerMode()) return;
    setRevision(readCooperadoMessengerRevisionForUser(user));
  }, [user]);

  useEffect(() => {
    if (!isCooperadoPwaMessengerMode()) return;
    readRevision();
    const onRefresh = () => readRevision();
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
  }, [readRevision]);

  return revision >= 0 ? revision : revisionSync;
}
