"use client";

import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import { getData, getDataRevision, isAppDataWarm, subscribe } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { AppData, User } from "@/types";

/** Contexto do card — não depende de useAppDataSelector (evita null antes do localStorage). */
export function useCooperadoInicioCardContext(user: Omit<User, "password"> | null | undefined): {
  data: AppData | null;
  cooperadoId: string;
  cooperativaId: string | undefined;
  dataReady: boolean;
} | null {
  const revision = useSyncExternalStore(
    subscribe,
    () => (isAppDataWarm() ? getDataRevision() : -1),
    () => -1
  );

  return useMemo(() => {
    if (!user?.cooperadoId) return null;
    const dataReady = isAppDataWarm();
    const data = dataReady ? getData() : null;
    let cooperativaId = user.cooperativaId;
    if (data) {
      cooperativaId = getUserCooperativaId(user, data) ?? cooperativaId;
    }
    const cooperadoId =
      data && cooperativaId
        ? resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId)
        : user.cooperadoId;
    return { data, cooperadoId, cooperativaId, dataReady };
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, revision]);
}
