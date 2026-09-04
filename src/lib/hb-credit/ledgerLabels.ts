import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";

const LEDGER_LABELS: Record<string, string> = {
  LIMIT_RELEASE: "Crédito liberado",
  LIMIT_ADJUST: "Ajuste de limite",
  PAYMENT: "Pagamento no mercado",
  REFUND: "Estorno",
  PARTNER_APPROVE: "Mercado aprovado",
  PARTNER_BLOCK: "Mercado bloqueado",
  CASHBACK_EARN: `Cashback recebido (${CONTA_COOP_DESCONTO_SPLIT.cooperadoPercent}%)`,
  CASHBACK_USE: "Cashback usado no pagamento",
  CASHBACK_SWEEP: "Cashback convertido em crédito",
};

export function labelLedgerTipo(tipo: string): string {
  return LEDGER_LABELS[tipo] ?? tipo.replace(/_/g, " ").toLowerCase();
}
