import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import type { ContaCoopLedgerEntry } from "@/modules/hb-credit/types";

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

/** Título do extrato — inclui nome do mercado quando disponível. */
export function formatLedgerEntryLabel(
  entry: Pick<ContaCoopLedgerEntry, "tipo" | "parceiroNome">
): string {
  const tipo = String(entry.tipo);
  const mercado = entry.parceiroNome?.trim();
  if (mercado) {
    if (tipo === "PAYMENT") return `Pagamento — ${mercado}`;
    if (tipo === "REFUND") return `Estorno — ${mercado}`;
    if (tipo === "CASHBACK_EARN") return `Cashback — ${mercado}`;
  }
  return labelLedgerTipo(tipo);
}
