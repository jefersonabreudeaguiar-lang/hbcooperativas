"use client";

import { CobrancaSaasPainel as CobrancaPixManualPainel } from "@/components/cobranca/CobrancaSaasPainel";

/**
 * Mensalidade do app: PIX do criador + “pagamento informado”.
 * Confirmação fica só no admin (criador). Sem contrato SaaS e sem Asaas no painel.
 */
export function CobrancaSaasPainel() {
  return <CobrancaPixManualPainel />;
}
