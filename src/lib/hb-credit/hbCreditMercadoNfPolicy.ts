/**
 * A partir de 20/10/2026 o mercado não envia NF de cooperado.
 * A compra HB Créditos já nasce liberada para recebimento.
 */
export const HB_CREDIT_MERCADO_NF_DISPENSADA_DESDE = "2026-10-20";

export const HB_CREDIT_MERCADO_NF_DISPENSADA = true;

export function isHbCreditMercadoNfDispensada(): boolean {
  return HB_CREDIT_MERCADO_NF_DISPENSADA;
}

export const HB_CREDIT_MERCADO_NF_AVISO_TITULO =
  "Comunicado da Direção — 20 de outubro de 2026";

export const HB_CREDIT_MERCADO_NF_AVISO_CORPO = [
  "A partir de 20 de outubro de 2026, as compras feitas com HB Créditos dispensam o envio de notas fiscais em nome do cooperado pelo painel do mercado.",
  "A área de contabilidade concluiu que esse envio não é necessário: o cooperado já assina um documento autorizando a movimentação financeira dos valores de suas entregas para uso em créditos nos mercados parceiros.",
  "Cada compra fica automaticamente liberada para o mercado receber, sem retenção por nota fiscal a enviar.",
].join(" ");

export const HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA = "Agradece a Direção HB Coop.";

export const HB_CREDIT_MERCADO_NF_AVISO_BOTAO = "Li e confirmo";

export const HB_CREDIT_MERCADO_NF_AVISO_ACK_PREFIX = "hb-credit-mercado-nf-aviso-ack:v1";

export function hbCreditMercadoNfAvisoAckKey(partnerId: string, cnpjCooperativa?: string): string {
  const id = String(partnerId ?? "").trim();
  const cnpj = String(cnpjCooperativa ?? "").replace(/\D/g, "");
  return `${HB_CREDIT_MERCADO_NF_AVISO_ACK_PREFIX}:${cnpj || "_"}:${id}`;
}
