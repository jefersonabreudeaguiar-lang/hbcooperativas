/**
 * Modelo discreto do acoplamento operacional (pagamento) × Postgres (HB authorize/sync).
 * Usado apenas em testes Fase 2.2 / 2.4 — não altera produção.
 * Fase 2.4: staleGuard + payment_awaiting_register → STALE antes de authorize (PIX).
 *
 * Premissas alinhadas ao código:
 * - authorize só lê hb_credit_accounts (limit_released, amount_used), não operacional.
 * - sync pós-pagamento recalcula limit_released a partir do crédito-base authoritative (operacional).
 * - base=0 e sem uso: limite → 0 (reset).
 * - base=0 com amount_used>0: limite aperta para max(amount_used) (syncLimiteCooperadoFromCreditoBase).
 */

import { calcLimiteFromPercentual } from "../../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import {
  HB_CREDIT_STATE_STALE_CODE,
  type HbFinancialLimitSyncState,
} from "../../src/modules/hb-credit/engine/hbCreditLimitSyncState.ts";

export type HbAccountState = {
  limitReleasedCents: number;
  amountUsedCents: number;
  financialLimitSyncState?: HbFinancialLimitSyncState;
};

export type OperacionalPaymentState = {
  /** Valor a receber pendente (centavos) — proxy do authoritative após regras PNAE. */
  creditoBaseAuthoritativeCents: number;
  pagamentoConfirmado: boolean;
};

export type ConcurrencySnapshot = {
  label: string;
  operacional: OperacionalPaymentState;
  hb: HbAccountState;
  tetoPercent: number;
};

export function availableCents(hb: HbAccountState): number {
  return Math.max(0, hb.limitReleasedCents - hb.amountUsedCents);
}

/** Operacional persistido: pagamento confirmado → base authoritative conforme regra simulada. */
export function persistPaymentConfirm(
  op: OperacionalPaymentState,
  opts: { fullSettlementCents: number }
): OperacionalPaymentState {
  return {
    pagamentoConfirmado: true,
    creditoBaseAuthoritativeCents: Math.max(
      0,
      op.creditoBaseAuthoritativeCents - opts.fullSettlementCents
    ),
  };
}

/** Pagamento aguardando (regra TS): a receber já pode zerar antes da assinatura. */
export function registerPaymentAwaiting(op: OperacionalPaymentState): OperacionalPaymentState {
  return {
    ...op,
    pagamentoConfirmado: false,
    creditoBaseAuthoritativeCents: 0,
  };
}

/**
 * syncHbLimitAfterCooperadoPayment / syncLimiteCooperadoFromCreditoBase (simplificado).
 */
export function syncHbLimitFromAuthoritative(
  hb: HbAccountState,
  creditoBaseCents: number,
  tetoPercent: number
): HbAccountState {
  const base = Math.max(0, Math.round(creditoBaseCents));
  if (base === 0) {
    if (hb.amountUsedCents === 0) {
      return { limitReleasedCents: 0, amountUsedCents: 0 };
    }
    const alvo = hb.amountUsedCents;
    if (hb.limitReleasedCents > alvo) {
      return { limitReleasedCents: alvo, amountUsedCents: hb.amountUsedCents };
    }
    return { ...hb };
  }
  let novo = calcLimiteFromPercentual(base, tetoPercent);
  if (novo < hb.amountUsedCents) {
    novo = hb.amountUsedCents;
  }
  return { limitReleasedCents: novo, amountUsedCents: hb.amountUsedCents };
}

/** hb_credit_authorize_payment — débito em credit_debit (= gross simplificado). */
export function authorizeHb(
  hb: HbAccountState,
  grossCents: number,
  opts?: { enforceSyncState?: boolean }
): { hb: HbAccountState; ok: boolean; error?: string; errorCode?: string } {
  if (opts?.enforceSyncState) {
    const state = hb.financialLimitSyncState ?? "SYNCED";
    if (state !== "SYNCED") {
      return {
        hb,
        ok: false,
        error: "O crédito está sendo atualizado. Aguarde alguns instantes e tente novamente.",
        errorCode: HB_CREDIT_STATE_STALE_CODE,
      };
    }
  }
  const debit = Math.max(0, Math.round(grossCents));
  const disponivel = availableCents(hb);
  if (disponivel < debit) {
    return { hb, ok: false, error: "Limite insuficiente." };
  }
  return {
    ok: true,
    hb: {
      ...hb,
      limitReleasedCents: hb.limitReleasedCents,
      amountUsedCents: hb.amountUsedCents + debit,
    },
  };
}

export type InterleaveStep =
  | { kind: "payment_persist"; fullSettlementCents: number }
  | { kind: "authorize"; grossCents: number }
  | { kind: "sync_hb" }
  | { kind: "payment_awaiting_register" };

export function runInterleavedScenario(opts: {
  name: string;
  tetoPercent: number;
  initialBaseCents: number;
  steps: InterleaveStep[];
  /** Fase 2.3: payment marca STALE; sync marca SYNCED; authorize respeita estado. */
  staleGuard?: boolean;
}): {
  name: string;
  snapshots: ConcurrencySnapshot[];
  final: ConcurrencySnapshot;
  authorizeOkCount: number;
  authorizeFailCount: number;
} {
  let op: OperacionalPaymentState = {
    creditoBaseAuthoritativeCents: opts.initialBaseCents,
    pagamentoConfirmado: false,
  };
  let hb: HbAccountState = {
    limitReleasedCents: calcLimiteFromPercentual(opts.initialBaseCents, opts.tetoPercent),
    amountUsedCents: 0,
    financialLimitSyncState: "SYNCED",
  };

  const staleGuard = Boolean(opts.staleGuard);

  const snapshots: ConcurrencySnapshot[] = [
    {
      label: "T0",
      operacional: { ...op },
      hb: { ...hb },
      tetoPercent: opts.tetoPercent,
    },
  ];

  let authorizeOkCount = 0;
  let authorizeFailCount = 0;
  let t = 1;

  for (const step of opts.steps) {
    if (step.kind === "payment_awaiting_register") {
      op = registerPaymentAwaiting(op);
      if (staleGuard) {
        hb = { ...hb, financialLimitSyncState: "STALE" };
      }
    } else if (step.kind === "payment_persist") {
      op = persistPaymentConfirm(op, { fullSettlementCents: step.fullSettlementCents });
      if (staleGuard) {
        hb = { ...hb, financialLimitSyncState: "STALE" };
      }
    } else if (step.kind === "authorize") {
      const r = authorizeHb(hb, step.grossCents, { enforceSyncState: staleGuard });
      if (r.ok) authorizeOkCount++;
      else authorizeFailCount++;
      hb = r.hb;
    } else if (step.kind === "sync_hb") {
      hb = syncHbLimitFromAuthoritative(hb, op.creditoBaseAuthoritativeCents, opts.tetoPercent);
      if (staleGuard) {
        hb = { ...hb, financialLimitSyncState: "SYNCED" };
      }
    }

    snapshots.push({
      label: `T${t}`,
      operacional: { ...op },
      hb: { ...hb },
      tetoPercent: opts.tetoPercent,
    });
    t++;
  }

  return {
    name: opts.name,
    snapshots,
    final: snapshots[snapshots.length - 1],
    authorizeOkCount,
    authorizeFailCount,
  };
}

/** Compra usando limite stale após base operacional já zerada. */
export function detectStaleLimitConsumption(final: ConcurrencySnapshot): {
  staleAuthorizePossible: boolean;
  consumedWhileBaseZero: number;
  legitimateLimitCents: number;
} {
  const legit = calcLimiteFromPercentual(
    final.operacional.creditoBaseAuthoritativeCents,
    final.tetoPercent
  );
  const used = final.hb.amountUsedCents;
  const consumedWhileBaseZero =
    final.operacional.creditoBaseAuthoritativeCents === 0 ? used : 0;
  const staleAuthorizePossible =
    consumedWhileBaseZero > 0 && used > 0 && final.operacional.creditoBaseAuthoritativeCents === 0;
  return {
    staleAuthorizePossible,
    consumedWhileBaseZero,
    legitimateLimitCents: Math.max(legit, final.hb.amountUsedCents),
  };
}

export function assertInvariants(hb: HbAccountState): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (hb.amountUsedCents < 0) violations.push("amount_used negativo");
  if (hb.limitReleasedCents < 0) violations.push("limit negativo");
  if (hb.amountUsedCents > hb.limitReleasedCents) violations.push("amount_used > limit");
  if (availableCents(hb) < 0) violations.push("available < 0");
  return { ok: violations.length === 0, violations };
}

/** Monte Carlo: intercalar persist+sync vs authorize em ordem aleatória. */
export function monteCarloPaymentVsAuthorize(iterations: number, seed = 42): {
  staleSuccesses: number;
  invariantBreaks: number;
} {
  let staleSuccesses = 0;
  let invariantBreaks = 0;
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const base = 200_000;
  const teto = 50;
  const pay = 200_000;
  const buy = 100_000;

  for (let i = 0; i < iterations; i++) {
    const steps: InterleaveStep[] = [
      { kind: "payment_persist", fullSettlementCents: pay },
      { kind: "authorize", grossCents: buy },
      { kind: "sync_hb" },
    ];
    if (rnd() > 0.5) {
      steps[1] = { kind: "sync_hb" };
      steps[2] = { kind: "authorize", grossCents: buy };
    }
    const r = runInterleavedScenario({
      name: `mc-${i}`,
      tetoPercent: teto,
      initialBaseCents: base,
      steps,
    });
    const det = detectStaleLimitConsumption(r.final);
    if (det.staleAuthorizePossible && r.authorizeOkCount > 0) staleSuccesses++;
    const inv = assertInvariants(r.final.hb);
    if (!inv.ok) invariantBreaks++;
  }

  return { staleSuccesses, invariantBreaks };
}
