"use client";

import { useMemo } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { HbUnifiedPaymentPanel } from "@/components/payments/HbUnifiedPaymentPanel";
import {
  getPainelCobrancaSaasResponsavel,
  precisaAssinarContratoServico,
} from "@/services/cobrancaSaasService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { isDiretoriaRole } from "@/permissions";

/**
 * Mensalidade HB + repasse HB Créditos unificados via Asaas (valores reais da nuvem).
 */
export function CobrancaSaasPainel() {
  const { user } = useAuth();

  const coopId = useAppDataSelector(
    (d) => (user ? getUserCooperativaId(user, d) : undefined),
    [user?.id, user?.role, user?.cooperativaCnpj]
  );
  const coop = useAppDataSelector(
    (d) => (coopId ? d.cooperativas.find((c) => c.id === coopId) : undefined),
    [coopId]
  );
  const painel = useAppDataSelector(
    (d) => (coopId ? getPainelCobrancaSaasResponsavel(d, coopId) : undefined),
    [coopId]
  );

  const cnpj = useMemo(() => {
    if (user?.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    if (coop?.cnpj) return normalizeCnpj(coop.cnpj);
    return "";
  }, [user?.cooperativaCnpj, coop?.cnpj]);

  if (!user || !coopId || !cnpj || !isDiretoriaRole(user.role)) {
    return null;
  }

  if (precisaAssinarContratoServico(coop ?? undefined)) {
    return null;
  }

  if (painel?.statusMes === "em_dia" && !painel.aguardandoConfirmacao) {
    /* repasse may still be due — unified panel checks both */
  }

  return <HbUnifiedPaymentPanel cnpj={cnpj} />;
}
