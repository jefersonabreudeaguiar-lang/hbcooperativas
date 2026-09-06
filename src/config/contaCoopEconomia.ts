/** Divisão do desconto contratual HB Créditos (soma = 100%). */
export const CONTA_COOP_DESCONTO_SPLIT = {
  cooperadoPercent: 60,
  appPercent: 30,
  cooperativaPercent: 10,
} as const;

/** Valor mensal cobrado do cooperado (mensalidade app + taxa 30% HB Créditos). */
export const MENSALIDADE_COOPERADO_VALOR_PADRAO = 14.9;

export function formatValorMensalidadeCooperado(valor = MENSALIDADE_COOPERADO_VALOR_PADRAO): string {
  return valor.toFixed(2).replace(".", ",");
}

/** Texto na cobrança / registro de mensalidade gerada por cooperado. */
export function textoObservacaoMensalidadeApp(mesReferencia?: string): string {
  const ref = mesReferencia ? ` · ref. ${mesReferencia}` : "";
  return (
    `Mensalidade HB Cooperativas R$ ${formatValorMensalidadeCooperado()}/cooperado${ref} — ` +
    `inclui taxa de ${CONTA_COOP_DESCONTO_SPLIT.appPercent}% do desconto HB Créditos (app) e uso do aplicativo`
  );
}

/** Linha de desconto na ficha corrida ao pagar cooperado. */
export function textoDescontoMensalidadeFicha(mesReferencia: string, valor: number): string {
  return (
    `Mensalidade app HB R$ ${formatValorMensalidadeCooperado(valor)} · ` +
    `${CONTA_COOP_DESCONTO_SPLIT.appPercent}% HB Créditos · ${mesReferencia}`
  );
}
