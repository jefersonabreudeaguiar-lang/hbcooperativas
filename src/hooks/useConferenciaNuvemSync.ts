"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listConferenciaNuvemSyncFailed,
  retryAllFailedConferenciaNuvemSync,
  retryConferenciaNuvemSync,
  subscribeConferenciaNuvemSync,
  type ConferenciaNuvemSyncRecord,
} from "@/services/conferenciaDecisaoNuvemSync";

export function useConferenciaNuvemSync() {
  const [failed, setFailed] = useState<ConferenciaNuvemSyncRecord[]>([]);

  const refresh = useCallback(() => {
    setFailed(listConferenciaNuvemSyncFailed());
  }, []);

  useEffect(() => {
    refresh();
    return subscribeConferenciaNuvemSync(refresh);
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      if (listConferenciaNuvemSyncFailed().length > 0) {
        retryAllFailedConferenciaNuvemSync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const retryOne = useCallback(
    (notaId: string) => {
      retryConferenciaNuvemSync(notaId);
      refresh();
    },
    [refresh]
  );

  const retryAll = useCallback(() => {
    retryAllFailedConferenciaNuvemSync();
    refresh();
  }, [refresh]);

  return { failed, retryOne, retryAll };
}
