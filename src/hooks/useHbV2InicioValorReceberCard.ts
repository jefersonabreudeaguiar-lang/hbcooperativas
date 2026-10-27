"use client";

import { useCallback, useEffect, useState } from "react";
import type { InicioCardMotorSnapshot } from "@/lib/cooperadoInicioCardPolicy";
import { hbV2InicioCardSnapshotFromHbAccount } from "@/lib/hb-credit/hbCreditManualValorBruto";
import { HB_A_RECEBER_HIBRIDO_EVENT } from "@/lib/hb-credit/hbAReceberHibrido";
import { fetchCreditAccount } from "@/services/creditApiService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData } from "@/services/dataStore";
import type { User } from "@/types";

type AuthUser = Omit<User, "password">;

const SNAPSHOT_VAZIO: InicioCardMotorSnapshot = {
  mesLabel: "—",
  valor: 0,
  valorRecibo: 0,
  aguardandoAssinatura: false,
};

/** V2: card Início = valor bruto manual (hb_credit_accounts) − crédito HB usado. */
export function useHbV2InicioValorReceberCard(opts: {
  user: AuthUser | null | undefined;
  cooperadoId: string | undefined;
  cooperativaId: string | undefined;
  tabAtiva: boolean;
}): { snapshot: InicioCardMotorSnapshot; atualizando: boolean } {
  const [snapshot, setSnapshot] = useState<InicioCardMotorSnapshot>(SNAPSHOT_VAZIO);
  const [atualizando, setAtualizando] = useState(false);

  const mesLabel = formatMesReferencia(getCurrentMesReferencia());

  const { user, cooperadoId, cooperativaId, tabAtiva } = opts;

  const reload = useCallback(async () => {
    if (!tabAtiva || !user || user.role !== "cooperado" || !cooperadoId) {
      setSnapshot(SNAPSHOT_VAZIO);
      return;
    }
    setAtualizando(true);
    try {
      const data = getData();
      const cnpj = await resolveCooperativaCnpj(data, cooperativaId, user);
      if (!cnpj) {
        setSnapshot(hbV2InicioCardSnapshotFromHbAccount(null, mesLabel));
        return;
      }
      const apiCooperadoId =
        resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId) ?? cooperadoId;
      const { account } = await fetchCreditAccount(cnpj, apiCooperadoId);
      setSnapshot(hbV2InicioCardSnapshotFromHbAccount(account ?? null, mesLabel));
    } catch {
      setSnapshot(hbV2InicioCardSnapshotFromHbAccount(null, mesLabel));
    } finally {
      setAtualizando(false);
    }
  }, [tabAtiva, user, cooperadoId, cooperativaId, mesLabel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => void reload();
    window.addEventListener(HB_A_RECEBER_HIBRIDO_EVENT, onRefresh);
    return () => window.removeEventListener(HB_A_RECEBER_HIBRIDO_EVENT, onRefresh);
  }, [reload]);

  return { snapshot, atualizando };
}
