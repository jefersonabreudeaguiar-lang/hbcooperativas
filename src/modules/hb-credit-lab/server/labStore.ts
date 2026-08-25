import { LAB_NAMESPACE } from "@/modules/hb-credit-lab/config";
import type {
  LabActivityItem,
  LabCreditAccount,
  LabCreditTransaction,
  LabLedgerEntry,
  LabMarket,
  LabMarketReceivable,
  LabPaymentAuthorization,
  LabPaymentIntent,
} from "@/modules/hb-credit-lab/types";
import { reaisToCents } from "@/modules/hb-credit-lab/engine/money";
import { createLabSeedState } from "@/modules/hb-credit-lab/mock/labSeed";

type LabState = {
  account: LabCreditAccount;
  markets: LabMarket[];
  intents: Map<string, LabPaymentIntent>;
  authorizations: Map<string, LabPaymentAuthorization>;
  transactions: Map<string, LabCreditTransaction>;
  receivables: Map<string, LabMarketReceivable>;
  ledger: LabLedgerEntry[];
  activities: LabActivityItem[];
  usedNonces: Set<string>;
  idempotency: Map<string, string>;
};

let state: LabState | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${LAB_NAMESPACE}_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getState(): LabState {
  if (!state) {
    state = createLabSeedState();
  }
  return state;
}

export function resetLabStoreForTests(): void {
  state = createLabSeedState();
}

export function getLabStatus() {
  return { namespace: LAB_NAMESPACE, seeded: Boolean(state) };
}

export function getLabAccount(): LabCreditAccount {
  return { ...getState().account };
}

export function getLabMarkets(): LabMarket[] {
  return [...getState().markets];
}

export function getLabMarket(id: string): LabMarket | undefined {
  return getState().markets.find((m) => m.id === id);
}

export function getLabActivities(limit = 10): LabActivityItem[] {
  return getState().activities.slice(0, limit);
}

export function getLabLedger(limit = 50): LabLedgerEntry[] {
  return getState().ledger.slice(0, limit);
}

export function getLabReceivables(marketId?: string): LabMarketReceivable[] {
  const all = [...getState().receivables.values()];
  return marketId ? all.filter((r) => r.marketId === marketId) : all;
}

export function getLabIntent(id: string): LabPaymentIntent | undefined {
  const intent = getState().intents.get(id);
  if (!intent) return undefined;
  if (intent.status === "pending" && new Date(intent.expiresAt).getTime() < Date.now()) {
    intent.status = "expired";
  }
  return { ...intent };
}

export function createLabPaymentIntent(input: {
  marketId: string;
  amountReais: number;
  descricao?: string;
}): LabPaymentIntent {
  const s = getState();
  const market = s.markets.find((m) => m.id === input.marketId);
  if (!market) throw new Error("Mercado de laboratório não encontrado.");

  const amountCents = reaisToCents(input.amountReais);
  if (amountCents <= 0) throw new Error("Valor experimental inválido.");

  const id = genId("intent");
  const nonce = genId("nonce");
  const intent: LabPaymentIntent = {
    id,
    marketId: market.id,
    marketNome: market.nome,
    cooperadoLabId: s.account.cooperadoLabId,
    amountCents,
    descricao: input.descricao?.trim() || undefined,
    status: "pending",
    nonce,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    createdAt: nowIso(),
    idempotencyKey: genId("idem"),
  };
  s.intents.set(id, intent);
  return { ...intent };
}

export function buildLabQrPayload(intent: LabPaymentIntent): string {
  return `hb-credit-lab://pay/${intent.id}?nonce=${encodeURIComponent(intent.nonce)}`;
}

export function parseLabQrPayload(raw: string): { intentId: string; nonce: string } | null {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed) as { scheme?: string; intentId?: string; nonce?: string };
      if (json.scheme === "hb-credit-lab" && json.intentId && json.nonce) {
        return { intentId: json.intentId, nonce: json.nonce };
      }
    }
    const url = trimmed.startsWith("hb-credit-lab://")
      ? new URL(trimmed.replace("hb-credit-lab://", "https://lab.local/"))
      : new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const intentId = parts[parts.length - 1];
    const nonce = url.searchParams.get("nonce") ?? "";
    if (!intentId || !nonce) return null;
    return { intentId, nonce };
  } catch {
    return null;
  }
}

export function authorizeLabPayment(input: {
  intentId: string;
  nonce: string;
  idempotencyKey: string;
}): {
  authorization: LabPaymentAuthorization;
  transaction: LabCreditTransaction;
  intent: LabPaymentIntent;
} {
  const s = getState();

  const cached = s.idempotency.get(input.idempotencyKey);
  if (cached) {
    const tx = s.transactions.get(cached);
    if (tx) {
      const auth = [...s.authorizations.values()].find((a) => a.id === tx.authorizationId);
      const intent = s.intents.get(tx.intentId);
      if (auth && intent) {
        return { authorization: { ...auth }, transaction: { ...tx }, intent: { ...intent } };
      }
    }
  }

  const intent = s.intents.get(input.intentId);
  if (!intent) throw new Error("Cobrança experimental não encontrada.");
  if (intent.status !== "pending") throw new Error("Cobrança já utilizada ou expirada.");
  if (intent.nonce !== input.nonce) throw new Error("QR inválido para esta cobrança.");
  if (s.usedNonces.has(input.nonce)) throw new Error("QR de uso único já consumido.");
  if (new Date(intent.expiresAt).getTime() < Date.now()) {
    intent.status = "expired";
    throw new Error("Cobrança experimental expirada.");
  }

  const account = s.account;
  if (account.saldoDisponivelCents < intent.amountCents) {
    throw new Error("Saldo experimental insuficiente.");
  }

  const saldoAntes = account.saldoDisponivelCents;
  account.saldoDisponivelCents -= intent.amountCents;
  account.updatedAt = nowIso();

  const authId = genId("auth");
  const txId = genId("tx");
  const authorization: LabPaymentAuthorization = {
    id: authId,
    intentId: intent.id,
    cooperadoLabId: account.cooperadoLabId,
    amountCents: intent.amountCents,
    saldoAntesCents: saldoAntes,
    saldoDepoisCents: account.saldoDisponivelCents,
    authorizedAt: nowIso(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    idempotencyKey: input.idempotencyKey,
  };

  intent.status = "consumed";
  intent.consumedAt = nowIso();
  s.usedNonces.add(input.nonce);

  const receiptCode = genId("receipt").slice(-8).toUpperCase();
  const transaction: LabCreditTransaction = {
    id: txId,
    authorizationId: authId,
    intentId: intent.id,
    marketId: intent.marketId,
    cooperadoLabId: account.cooperadoLabId,
    amountCents: intent.amountCents,
    status: "completed",
    receiptCode,
    createdAt: nowIso(),
  };

  const ledgerEntry: LabLedgerEntry = {
    id: genId("ledger"),
    accountId: account.id,
    type: "debit",
    amountCents: intent.amountCents,
    balanceAfterCents: account.saldoDisponivelCents,
    referenceType: "payment",
    referenceId: txId,
    memo: `Pagamento lab — ${intent.marketNome}`,
    createdAt: nowIso(),
  };

  const receivable: LabMarketReceivable = {
    id: genId("recv"),
    marketId: intent.marketId,
    authorizationId: authId,
    amountCents: intent.amountCents,
    status: "pending_settlement",
    createdAt: nowIso(),
  };

  s.authorizations.set(authId, authorization);
  s.transactions.set(txId, transaction);
  s.receivables.set(receivable.id, receivable);
  s.ledger.unshift(ledgerEntry);
  s.activities.unshift({
    id: genId("act"),
    titulo: intent.marketNome,
    subtitulo: intent.descricao ?? "Pagamento experimental",
    amountCents: intent.amountCents,
    tipo: "debito",
    createdAt: nowIso(),
  });
  s.idempotency.set(input.idempotencyKey, txId);

  return {
    authorization: { ...authorization },
    transaction: { ...transaction },
    intent: { ...intent },
  };
}

export function getLabTransaction(id: string): LabCreditTransaction | undefined {
  const tx = getState().transactions.get(id);
  return tx ? { ...tx } : undefined;
}
