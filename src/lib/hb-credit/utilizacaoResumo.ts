/** Projeção HB → resumo cooperado (sem duplicar contabilidade; lê hb_credit_transactions). */

export type HbTransacaoAbateInput = {
  event_type: string;
  status: string;
  amount_cents: number;
  credit_debited_cents?: number | null;
  gross_amount_cents?: number | null;
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Valor da linha no resumo (sempre positivo; sinal vem do tipo conta_coop vs credito). */
export function valorReaisLinhaResumoCooperado(tx: HbTransacaoAbateInput): number {
  const gross = Number(tx.gross_amount_cents ?? tx.amount_cents) / 100;
  const amount = Number(tx.amount_cents) / 100;
  const debited = Number(tx.credit_debited_cents ?? tx.amount_cents) / 100;
  if (String(tx.event_type) === "REFUND") return round2(amount);
  if (String(tx.event_type) === "PAYMENT" && String(tx.status) === "reversed") return round2(gross);
  if (String(tx.event_type) === "PAYMENT" && String(tx.status) === "posted") return round2(debited);
  return round2(amount);
}

/**
 * Impacto líquido no A receber (negativo = reduz, positivo = aumenta).
 * Compra confirmada posted abate pelo crédito debitado; estorno devolve; par estornada zera.
 */
export function impactoAReceberReais(tx: HbTransacaoAbateInput): number {
  const gross = Number(tx.gross_amount_cents ?? tx.amount_cents) / 100;
  const amount = Number(tx.amount_cents) / 100;
  const debited = Number(tx.credit_debited_cents ?? tx.amount_cents) / 100;
  if (String(tx.event_type) === "REFUND" && String(tx.status) === "posted") return round2(amount);
  if (String(tx.event_type) === "PAYMENT" && String(tx.status) === "reversed") return round2(-gross);
  if (String(tx.event_type) === "PAYMENT" && String(tx.status) === "posted") return round2(-debited);
  return 0;
}

export type HbUtilizacaoResumoLancamento = {
  hbTransactionId: string;
  paymentIntentId?: string;
  cooperadoId: string;
  partnerId: string;
  partnerNome: string;
  receiptCode?: string;
  eventType: "PAYMENT" | "REFUND";
  transactionStatus: string;
  statusResumo: "CONFIRMED" | "REVERSED" | "REFUND";
  createdAt: string;
  valorCompraReais: number;
  descontoMercadoPercent?: number;
  valorDescontoReais: number;
  valorFinalCompraReais: number;
  valorHbUtilizadoReais: number;
  valorImpactoAReceberReais: number;
  saldoAReceberAnteriorReais?: number;
  saldoAReceberPosteriorReais?: number;
  observacao?: string;
};

export function statusResumoFromTx(eventType: string, status: string): HbUtilizacaoResumoLancamento["statusResumo"] {
  if (eventType === "REFUND" && status === "posted") return "REFUND";
  if (eventType === "PAYMENT" && status === "reversed") return "REVERSED";
  if (eventType === "PAYMENT" && status === "posted") return "CONFIRMED";
  return "CONFIRMED";
}

export function enriquecerSaldosHbUtilizacao(
  lancamentos: HbUtilizacaoResumoLancamento[],
  saldoInicialAReceberReais: number
): HbUtilizacaoResumoLancamento[] {
  let saldo = round2(saldoInicialAReceberReais);
  return lancamentos.map((l) => {
    const anterior = saldo;
    saldo = round2(saldo + l.valorImpactoAReceberReais);
    return {
      ...l,
      saldoAReceberAnteriorReais: anterior,
      saldoAReceberPosteriorReais: saldo,
    };
  });
}

/** A receber após entregas e descontos que não são HB (mensalidade, avulso etc.). */
export function saldoAReceberBaseAntesHb(
  valorEntregas: number,
  descontosExtras: Array<{ tipo: string; motivo: string; valor: number }>
): number {
  let saldo = valorEntregas;
  for (const d of descontosExtras) {
    if (d.tipo === "conta_coop") continue;
    if (d.tipo === "credito_avulso" && d.motivo.toLowerCase().includes("estorno")) continue;
    if (d.tipo === "credito_avulso") saldo = round2(saldo + d.valor);
    else saldo = round2(saldo - d.valor);
  }
  return round2(saldo);
}
