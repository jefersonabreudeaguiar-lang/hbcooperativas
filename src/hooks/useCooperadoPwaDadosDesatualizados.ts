"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@/types";
import {
  COOPERADO_PWA_DADOS_FRESH_EVENT,
  COOPERADO_PWA_DADOS_STALE_EVENT,
  cooperadoPwaFinanceiroSnapshotsAusentesForUser,
  cooperadoPwaMostraDadosDesatualizados,
} from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

export function useCooperadoPwaDadosDesatualizados(
  user: Omit<User, "password"> | null | undefined
): boolean {
  const read = useCallback(() => cooperadoPwaMostraDadosDesatualizados(user), [user]);
  const [stale, setStale] = useState(() => read());

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) {
      setStale(false);
      return;
    }
    const bump = () => setStale(read());
    bump();
    window.addEventListener(COOPERADO_PWA_DADOS_STALE_EVENT, bump);
    window.addEventListener(COOPERADO_PWA_DADOS_FRESH_EVENT, bump);
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, bump);
    return () => {
      window.removeEventListener(COOPERADO_PWA_DADOS_STALE_EVENT, bump);
      window.removeEventListener(COOPERADO_PWA_DADOS_FRESH_EVENT, bump);
      window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, bump);
    };
  }, [read, user?.id, user?.role]);

  return stale;
}

export function useCooperadoPwaFinanceiroSnapshotsAusentes(
  user: Omit<User, "password"> | null | undefined
): boolean {
  const read = useCallback(() => cooperadoPwaFinanceiroSnapshotsAusentesForUser(user), [user]);
  const [empty, setEmpty] = useState(() => read());

  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) {
      setEmpty(false);
      return;
    }
    const bump = () => setEmpty(read());
    bump();
    window.addEventListener(COOPERADO_PWA_DADOS_STALE_EVENT, bump);
    window.addEventListener(COOPERADO_PWA_DADOS_FRESH_EVENT, bump);
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, bump);
    return () => {
      window.removeEventListener(COOPERADO_PWA_DADOS_STALE_EVENT, bump);
      window.removeEventListener(COOPERADO_PWA_DADOS_FRESH_EVENT, bump);
      window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, bump);
    };
  }, [read, user?.id, user?.role]);

  return empty;
}
