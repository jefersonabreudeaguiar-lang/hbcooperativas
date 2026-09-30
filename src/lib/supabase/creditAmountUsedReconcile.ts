import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFichaQuitadaContextForCooperado,
  computeAmountUsedCentsFromPayments,
  type PaymentRowForUsedWithMeta,
} from "@/lib/hb-credit/creditAmountUsedFichaQuitada";
import { titularCooperadoIds } from "@/lib/hb-credit/repairOperacionalContaCoopDescontos";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { fetchAllCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { normalizeCnpj } from "@/utils/cooperativa";

export type PaymentRowForUsed = PaymentRowForUsedWithMeta;

export { computeAmountUsedCentsFromPayments };

const RECONCILE_ACTOR = "system:hb_credit_amount_used_reconcile";

const PAYMENT_TX_SELECT =
  "id, cooperado_id, created_at, event_type, status, amount_cents, credit_debited_cents";

async function loadFichaQuitadaContext(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<
  | { ok: true; titularIds: string[]; fichaQuitada?: ReturnType<typeof buildFichaQuitadaContextForCooperado> }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  let operacional = null;
  try {
    operacional = await fetchOperacionalSync(supabase, digits);
  } catch {
    operacional = null;
  }
  if (!operacional) {
    return { ok: true, titularIds: [cooperadoId] };
  }
  let cooperados: Awaited<ReturnType<typeof fetchAllCooperadosFromStorage>> = [];
  try {
    cooperados = await fetchAllCooperadosFromStorage(supabase, digits);
  } catch {
    cooperados = [];
  }
  const titularIds = cooperados.length ? titularCooperadoIds(cooperados, cooperadoId) : [cooperadoId];
  const fichaQuitada = buildFichaQuitadaContextForCooperado(operacional, cooperados, cooperadoId);
  return { ok: true, titularIds, fichaQuitada };
}

async function applyAmountUsedCorrection(
  supabase: SupabaseClient,
  digits: string,
  account: { id: string; limit_released_cents: number; amount_used_cents: number },
  cooperadoId: string,
  expected: number,
  actorUserId: string
): Promise<
  | { ok: true; corrected: false; expectedCents: number; storedCents: number }
  | { ok: true; corrected: true; expectedCents: number; previousCents: number }
  | { ok: false; error: string }
> {
  const stored = Number(account.amount_used_cents ?? 0);
  const limit = Number(account.limit_released_cents ?? 0);

  if (stored === expected) {
    return { ok: true, corrected: false, expectedCents: expected, storedCents: stored };
  }

  const clamped = Math.min(Math.max(0, expected), limit >= 0 ? limit : expected);
  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("hb_credit_accounts")
    .update({
      amount_used_cents: clamped,
      updated_at: now,
      updated_by: actorUserId,
    })
    .eq("id", account.id)
    .eq("amount_used_cents", stored);

  if (upErr) return { ok: false, error: upErr.message };

  await supabase.from("hb_credit_audit_log").insert({
    cooperative_cnpj: digits,
    actor: actorUserId,
    action: "AMOUNT_USED_RECONCILED",
    resource_type: "account",
    resource_id: cooperadoId,
    metadata: {
      previous_cents: stored,
      expected_cents: expected,
      applied_cents: clamped,
      ficha_quitada: true,
    },
  });

  return { ok: true, corrected: true, expectedCents: clamped, previousCents: stored };
}

export async function reconcileCooperadoAmountUsedCents(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  actorUserId: string = RECONCILE_ACTOR
): Promise<
  | { ok: true; corrected: false; expectedCents: number; storedCents: number }
  | { ok: true; corrected: true; expectedCents: number; previousCents: number }
  | { ok: false; error: string }
> {
  const digits = normalizeCnpj(cnpj);
  if (!cooperadoId) return { ok: false, error: "Cooperado inválido." };

  const ctxLoad = await loadFichaQuitadaContext(supabase, digits, cooperadoId);
  if (!ctxLoad.ok) return ctxLoad;

  const { data: account, error: accErr } = await supabase
    .from("hb_credit_accounts")
    .select("id, limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (accErr) return { ok: false, error: accErr.message };
  if (!account) return { ok: false, error: "Conta HB não encontrada." };

  let txQuery = supabase
    .from("hb_credit_transactions")
    .select(PAYMENT_TX_SELECT)
    .eq("cooperative_cnpj", digits)
    .eq("event_type", "PAYMENT");
  txQuery =
    ctxLoad.titularIds.length === 1
      ? txQuery.eq("cooperado_id", ctxLoad.titularIds[0])
      : txQuery.in("cooperado_id", ctxLoad.titularIds);
  const { data: txs, error: txErr } = await txQuery;

  if (txErr) return { ok: false, error: txErr.message };

  const expected = computeAmountUsedCentsFromPayments(
    (txs ?? []) as PaymentRowForUsed[],
    ctxLoad.fichaQuitada
  );

  return applyAmountUsedCorrection(supabase, digits, account, cooperadoId, expected, actorUserId);
}

/** “Utilizado” exibido — compras HB menos as já quitadas na ficha (mesmo titular). */
export async function resolveExpectedAmountUsedCentsForCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  if (!cooperadoId) return 0;

  const ctxLoad = await loadFichaQuitadaContext(supabase, digits, cooperadoId);
  if (!ctxLoad.ok) return 0;

  let txQuery = supabase
    .from("hb_credit_transactions")
    .select(PAYMENT_TX_SELECT)
    .eq("cooperative_cnpj", digits)
    .eq("event_type", "PAYMENT");
  txQuery =
    ctxLoad.titularIds.length === 1
      ? txQuery.eq("cooperado_id", ctxLoad.titularIds[0])
      : txQuery.in("cooperado_id", ctxLoad.titularIds);
  const { data: txs, error: txErr } = await txQuery;
  if (txErr) return 0;

  return computeAmountUsedCentsFromPayments(
    (txs ?? []) as PaymentRowForUsed[],
    ctxLoad.fichaQuitada
  );
}

/** Alinha amount_used de vários cooperados (aba Limites / pós-pagamento) — uma leitura do operacional. */
export async function reconcileCooperadosAmountUsedCentsBatch(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIds: string[],
  actorUserId: string = RECONCILE_ACTOR
): Promise<{ corrected: number; skipped: number; errors: string[] }> {
  const digits = normalizeCnpj(cnpj);
  const unique = [...new Set(cooperadoIds.filter(Boolean))];
  if (!unique.length) return { corrected: 0, skipped: 0, errors: [] };

  const operacional = await fetchOperacionalSync(supabase, digits).catch(() => null);
  const cooperados = operacional
    ? await fetchAllCooperadosFromStorage(supabase, digits).catch(() => [])
    : [];

  const { data: accounts, error: accErr } = await supabase
    .from("hb_credit_accounts")
    .select("id, cooperado_id, limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", digits);

  if (accErr) return { corrected: 0, skipped: 0, errors: [accErr.message] };

  const accountsFiltered = (accounts ?? []).filter((a) => unique.includes(String(a.cooperado_id)));

  const accountByCoop = new Map(
    accountsFiltered.map((a) => [
      String(a.cooperado_id),
      a as { id: string; limit_released_cents: number; amount_used_cents: number },
    ])
  );

  const titularByCoop = new Map<string, string[]>();
  for (const id of unique) {
    titularByCoop.set(id, operacional ? titularCooperadoIds(cooperados, id) : [id]);
  }
  const allTitular = [...new Set([...titularByCoop.values()].flat())];
  const txCooperadoFilter = allTitular.length ? allTitular : unique;

  let txQuery = supabase
    .from("hb_credit_transactions")
    .select(PAYMENT_TX_SELECT)
    .eq("cooperative_cnpj", digits)
    .eq("event_type", "PAYMENT");
  txQuery =
    txCooperadoFilter.length === 1
      ? txQuery.eq("cooperado_id", txCooperadoFilter[0])
      : txQuery.in("cooperado_id", txCooperadoFilter);
  const { data: txs, error: txErr } = await txQuery;

  if (txErr) return { corrected: 0, skipped: 0, errors: [txErr.message] };

  const txsByCooperado = new Map<string, PaymentRowForUsed[]>();
  for (const row of txs ?? []) {
    const cid = String((row as { cooperado_id?: string }).cooperado_id ?? "");
    if (!cid) continue;
    const list = txsByCooperado.get(cid) ?? [];
    list.push(row as PaymentRowForUsed);
    txsByCooperado.set(cid, list);
  }

  let corrected = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cooperadoId of unique) {
    const account = accountByCoop.get(cooperadoId);
    if (!account) {
      skipped++;
      continue;
    }
    const titularIds = titularByCoop.get(cooperadoId) ?? [cooperadoId];
    const mergedTxs: PaymentRowForUsed[] = [];
    for (const tid of titularIds) {
      const chunk = txsByCooperado.get(tid);
      if (chunk?.length) mergedTxs.push(...chunk);
    }
    const fichaQuitada =
      operacional && cooperados.length
        ? buildFichaQuitadaContextForCooperado(operacional, cooperados, cooperadoId)
        : undefined;
    const expected = computeAmountUsedCentsFromPayments(mergedTxs, fichaQuitada);
    const result = await applyAmountUsedCorrection(
      supabase,
      digits,
      account,
      cooperadoId,
      expected,
      actorUserId
    );
    if (!result.ok) {
      errors.push(`${cooperadoId}: ${result.error}`);
      continue;
    }
    if (result.corrected) corrected++;
    else skipped++;
  }

  return { corrected, skipped, errors };
}
