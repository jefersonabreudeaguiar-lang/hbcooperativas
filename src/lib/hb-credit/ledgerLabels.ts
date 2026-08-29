const LEDGER_LABELS: Record<string, string> = {
  LIMIT_RELEASE: "Crédito liberado",
  LIMIT_ADJUST: "Ajuste de limite",
  PAYMENT: "Pagamento no mercado",
  REFUND: "Estorno",
  PARTNER_APPROVE: "Mercado aprovado",
  PARTNER_BLOCK: "Mercado bloqueado",
};

export function labelLedgerTipo(tipo: string): string {
  return LEDGER_LABELS[tipo] ?? tipo.replace(/_/g, " ").toLowerCase();
}
