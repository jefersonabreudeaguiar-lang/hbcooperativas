/** Nome comercial exibido ao usuário (menus, telas, mensagens). IDs internos e rotas permanecem conta_coop. */
export const HB_CREDIT_PRODUCT_NAME = "HB Créditos";

/** Substitui o nome legado em textos históricos (ficha, relatórios). */
export function displayHbCreditText(text: string): string {
  return text.replace(/\bHB Créditos\b/gi, HB_CREDIT_PRODUCT_NAME);
}

/** Reconhece motivos de compra/estorno HB Créditos (inclui registros legados). */
export function isHbCreditMotivo(motivo: string): boolean {
  const m = motivo.toLowerCase();
  return (
    m.includes("HB Créditos") ||
    m.includes("conta-coop") ||
    m.includes("compra HB Créditos") ||
    m.includes("hb créditos") ||
    m.includes("hb creditos") ||
    m.includes("compra hb cr")
  );
}
