"use client";

import { useMemo } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
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
  const data = useAppData();

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const coop = useMemo(
    () => (coopId && data ? data.cooperativas.find((c) => c.id === coopId) : undefined),
    [coopId, data]
  );

  const cnpj = useMemo(() => {
    if (user?.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    if (coop?.cnpj) return normalizeCnpj(coop.cnpj);
    return "";
  }, [user?.cooperativaCnpj, coop?.cnpj]);

  if (!user || !data || !isDiretoriaRole(user.role) || !coopId || !cnpj) {
    return null;
  }

  if (precisaAssinarContratoServico(coop)) {
    return null;
  }

  const painel = getPainelCobrancaSaasResponsavel(data, coopId);
  if (painel?.statusMes === "em_dia" && !painel.aguardandoConfirmacao) {
    /* repasse may still be due — unified panel checks both */
  }

  return <HbUnifiedPaymentPanel cnpj={cnpj} />;
}
