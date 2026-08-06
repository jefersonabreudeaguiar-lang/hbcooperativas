"use client";

import { useEffect, useMemo } from "react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { updateData } from "@/services/dataStore";
import { getCobrancaSaasAvisosResponsavel, sincronizarCicloCobrancaSaas } from "@/services/cobrancaSaasService";
import { getUserCooperativaId } from "@/utils/cooperativa";

/**
 * Avisos de cobrança / bloqueio temporário na área do responsável.
 * Soft-block: não impede fluxos — só destaca o status da mensalidade HB.
 */
export function CobrancaSaasBanner() {
  const { user } = useAuth();
  const data = useAppData();

  useEffect(() => {
    if (!user || !data || user.role === "cooperado") return;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return;
    const coop = data.cooperativas.find((c) => c.id === coopId);
    if (coop?.cobrancaSaas?.cicloInicioEm) return;
    const temCooperado = data.cooperados.some((c) => c.cooperativaId === coopId);
    if (!temCooperado) return;
    updateData((d) => sincronizarCicloCobrancaSaas(d, coopId));
  }, [user, data]);

  const aviso = useMemo(() => {
    if (!user || !data) return null;
    if (user.role === "cooperado") return null;
    const coopId = getUserCooperativaId(user, data);
    return getCobrancaSaasAvisosResponsavel(data, coopId);
  }, [user, data]);

  if (!aviso) return null;

  return (
    <AlertBanner variant={aviso.tom} title={aviso.titulo} className="mb-4">
      {aviso.mensagem}
    </AlertBanner>
  );
}
