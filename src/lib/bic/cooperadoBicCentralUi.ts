import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";

/** Leitura BIC central — todos os cooperados no mesmo critério (flag de deploy, não pilot por id). */
export function isCooperadoBicCentralUiEnabled(): boolean {
  return isBicCentralReadAuthorityEnabled();
}

/** Fluxo verde “PIX registrado / assinar recibo” — desligado quando BIC central está ativo (UI LAB). */
export function cooperadoUsarFluxoReciboAssinaturaNaUi(): boolean {
  return !isCooperadoBicCentralUiEnabled();
}
