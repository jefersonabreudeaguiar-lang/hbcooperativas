import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";

/** Leitura BIC central — todos os cooperados no mesmo critério (flag de deploy, não pilot por id). */
export function isCooperadoBicCentralUiEnabled(): boolean {
  return isBicCentralReadAuthorityEnabled();
}

/** Fluxo “PIX registrado / assinar recibo” — desligado para o cooperado (pagamento sem assinatura na UI). */
export function cooperadoUsarFluxoReciboAssinaturaNaUi(): boolean {
  return false;
}
