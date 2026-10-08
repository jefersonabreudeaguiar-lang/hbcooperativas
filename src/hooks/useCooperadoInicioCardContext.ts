"use client";

import { useCallback, useMemo } from "react";
import { useSyncExternalStore } from "react";
import {
  getAppDataDomainRevision,
  subscribeAppDataDomain,
  type AppDataNotifyDomain,
} from "@/lib/performance/appDataDomainNotify";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { AppData, User } from "@/types";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";

const INICIO_CARD_DOMAINS: AppDataNotifyDomain[] = ["shell", "notas", "financeiro"];

function inicioCardRevisionSnapshot(): string {
  if (!isAppDataWarm()) return "-1";
  return INICIO_CARD_DOMAINS.map((d) => getAppDataDomainRevision(d)).join(",");
}

/** Contexto do card — revisão por domínio (evita re-render em sync operacional irrelevante). */
export function useCooperadoInicioCardContext(user: Omit<User, "password"> | null | undefined): {
  data: AppData | null;
  cooperadoId: string;
  cooperativaId: string | undefined;
  dataReady: boolean;
} | null {
  const pwaLeveUi = isCooperadoPwaMobileLeveUi();

  const subscribeDomains = useCallback(
    (onChange: () => void) => {
      if (pwaLeveUi) return () => undefined;
      const unsubs = INICIO_CARD_DOMAINS.map((d) => subscribeAppDataDomain(d, onChange));
      return () => {
        for (const u of unsubs) u();
      };
    },
    [pwaLeveUi]
  );

  const revisionKey = useSyncExternalStore(
    subscribeDomains,
    () => (pwaLeveUi ? "pwa-leve-paused" : inicioCardRevisionSnapshot()),
    () => "-1"
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
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, revisionKey]);
}
