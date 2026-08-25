import { LAB_NAMESPACE } from "@/modules/hb-credit-lab/config";
import type {
  LabActivityItem,
  LabCreditAccount,
  LabLedgerEntry,
  LabMarket,
  LabPaymentIntent,
} from "@/modules/hb-credit-lab/types";

export function createLabSeedState() {
  const account: LabCreditAccount = {
    id: `${LAB_NAMESPACE}_account_cooperado`,
    cooperadoLabId: `${LAB_NAMESPACE}_cooperado_001`,
    cooperadoNome: "Cooperado Laboratório",
    saldoDisponivelCents: 48500,
    saldoReservadoCents: 0,
    updatedAt: new Date().toISOString(),
  };

  const markets: LabMarket[] = [
    { id: `${LAB_NAMESPACE}_market_a`, nome: "Mercado Laboratório A", cnpjLab: "00000000000191" },
    { id: `${LAB_NAMESPACE}_market_b`, nome: "Mercado Laboratório B", cnpjLab: "00000000000272" },
  ];

  const activities: LabActivityItem[] = [
    {
      id: `${LAB_NAMESPACE}_act_seed_1`,
      titulo: "Crédito inicial (LAB)",
      subtitulo: "Seed de laboratório — não é dinheiro real",
      amountCents: 48500,
      tipo: "credito",
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: `${LAB_NAMESPACE}_act_seed_2`,
      titulo: "Mercado Laboratório A",
      subtitulo: "Compra fictícia anterior",
      amountCents: 3290,
      tipo: "debito",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  const ledger: LabLedgerEntry[] = [
    {
      id: `${LAB_NAMESPACE}_ledger_seed_1`,
      accountId: account.id,
      type: "credit",
      amountCents: 51790,
      balanceAfterCents: 51790,
      referenceType: "seed",
      referenceId: `${LAB_NAMESPACE}_seed_credit`,
      memo: "Crédito fictício inicial",
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      id: `${LAB_NAMESPACE}_ledger_seed_2`,
      accountId: account.id,
      type: "debit",
      amountCents: 3290,
      balanceAfterCents: 48500,
      referenceType: "payment",
      referenceId: `${LAB_NAMESPACE}_tx_demo`,
      memo: "Pagamento demo Mercado A",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  return {
    account,
    markets,
    intents: new Map<string, LabPaymentIntent>(),
    authorizations: new Map(),
    transactions: new Map(),
    receivables: new Map(),
    ledger,
    activities,
    usedNonces: new Set<string>(),
    idempotency: new Map<string, string>(),
  };
}

export const LAB_DEMO_MARKET_SESSION = `${LAB_NAMESPACE}_market_session`;
