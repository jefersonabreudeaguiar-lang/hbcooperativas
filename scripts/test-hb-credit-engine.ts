/**
 * Testes HB Credit Engine: regra dos 3 valores, idempotência e anti double-spend.
 *
 * Uso (homologação, migrations foundation + operational aplicadas):
 *   HB_CREDIT_ENABLED=true npx tsx scripts/test-hb-credit-engine.ts
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY e cooperativa/cooperado de teste via env opcionais.
 */

import { createClient } from "@supabase/supabase-js";
import { computeDisponivel } from "../src/modules/hb-credit/engine/money";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function testTresValores(cnpj: string, cooperadoId: string) {
  const { data } = await supabase
    .from("hb_credit_accounts")
    .select("limit_released_cents, amount_used_cents")
    .eq("cooperative_cnpj", cnpj)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (!data) {
    console.log("  skip tres valores (sem limite cadastrado)");
    return;
  }

  const limite = Number(data.limit_released_cents);
  const usado = Number(data.amount_used_cents);
  const disponivel = computeDisponivel(limite, usado);
  assert(usado <= limite, "usado > limite");
  assert(limite === usado + disponivel, "limite != usado + disponivel");
  console.log("  ok tres valores", { limite, usado, disponivel });
}

async function testIdempotency(cnpj: string, cooperadoId: string, intentId: string, nonce: string) {
  const key = `test_idem_${Date.now()}`;
  const tx1 = `tx_test_${Date.now()}_a`;
  const tx2 = `tx_test_${Date.now()}_b`;
  const recv = `recv_test_${Date.now()}`;

  const params = {
    p_intent_id: intentId,
    p_nonce: nonce,
    p_cooperado_id: cooperadoId,
    p_cooperative_cnpj: cnpj,
    p_idempotency_key: key,
    p_transaction_id: tx1,
    p_receivable_id: recv,
    p_receipt_code: "TEST001",
    p_actor_user_id: "test-script",
  };

  const first = await supabase.rpc("hb_credit_authorize_payment", params);
  if (first.error?.message?.includes("does not exist")) {
    console.log("  skip idempotency (RPC ausente — aplique migrations hb_credit)");
    return;
  }

  const second = await supabase.rpc("hb_credit_authorize_payment", {
    ...params,
    p_transaction_id: tx2,
    p_receivable_id: `${recv}_2`,
  });

  const r1 = first.data as { ok?: boolean; duplicate?: boolean };
  const r2 = second.data as { ok?: boolean; duplicate?: boolean };

  if (r1?.ok) {
    assert(Boolean(r2?.duplicate), "segunda chamada deveria ser duplicate");
    console.log("  ok idempotency");
  } else {
    console.log("  skip idempotency (intent indisponível:", (first.data as { error?: string })?.error, ")");
  }
}

async function testDoubleSpend(cnpj: string, cooperadoId: string, amountCents: number) {
  const { data: limiteBefore } = await supabase
    .from("hb_credit_accounts")
    .select("amount_used_cents, limit_released_cents")
    .eq("cooperative_cnpj", cnpj)
    .eq("cooperado_id", cooperadoId)
    .maybeSingle();

  if (!limiteBefore) {
    console.log("  skip double-spend (sem limite)");
    return;
  }

  const disponivel = computeDisponivel(
    Number(limiteBefore.limit_released_cents),
    Number(limiteBefore.amount_used_cents)
  );

  if (disponivel < amountCents * 2) {
    console.log("  skip double-spend (disponível insuficiente para 2x teste)");
    return;
  }

  const parceiro = await supabase
    .from("hb_credit_partners")
    .select("id")
    .eq("cooperative_cnpj", cnpj)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  if (!parceiro.data?.id) {
    console.log("  skip double-spend (sem parceiro ativo)");
    return;
  }

  const mkIntent = async () => {
    const id = `intent_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nonce = `nonce_${Date.now()}`;
    await supabase.from("hb_credit_payment_intents").insert({
      id,
      cooperative_cnpj: cnpj,
      partner_id: parceiro.data!.id,
      amount_cents: amountCents,
      status: "PENDING",
      nonce,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    return { id, nonce };
  };

  const a = await mkIntent();
  const b = await mkIntent();

  const run = (intentId: string, nonce: string, suffix: string) =>
    supabase.rpc("hb_credit_authorize_payment", {
      p_intent_id: intentId,
      p_nonce: nonce,
      p_cooperado_id: cooperadoId,
      p_cooperative_cnpj: cnpj,
      p_idempotency_key: `ds_${suffix}_${Date.now()}`,
      p_transaction_id: `tx_ds_${suffix}_${Date.now()}`,
      p_receivable_id: `recv_ds_${suffix}_${Date.now()}`,
      p_receipt_code: suffix.toUpperCase(),
      p_actor_user_id: "test-script",
    });

  const [ra, rb] = await Promise.all([run(a.id, a.nonce, "a"), run(b.id, b.nonce, "b")]);
  const okCount = [ra.data, rb.data].filter((d) => (d as { ok?: boolean })?.ok && !(d as { duplicate?: boolean })?.duplicate).length;
  assert(okCount === 1, `double-spend: esperado 1 ok, obteve ${okCount}`);
  console.log("  ok double-spend (1 confirmada, 1 recusada)");
}

async function main() {
  const cnpj = (process.env.TEST_COOP_CNPJ ?? "").replace(/\D/g, "");
  const cooperadoId = process.env.TEST_COOPERADO_ID ?? "";

  console.log("HB Credit Engine — testes");
  console.log("tres valores...");
  if (cnpj && cooperadoId) await testTresValores(cnpj, cooperadoId);
  else console.log("  defina TEST_COOP_CNPJ e TEST_COOPERADO_ID para testes completos");

  console.log("idempotency...");
  if (cnpj && cooperadoId && process.env.TEST_INTENT_ID && process.env.TEST_INTENT_NONCE) {
    await testIdempotency(cnpj, cooperadoId, process.env.TEST_INTENT_ID, process.env.TEST_INTENT_NONCE);
  } else {
    console.log("  skip (defina TEST_INTENT_ID + TEST_INTENT_NONCE para teste de idempotência)");
  }

  console.log("double-spend...");
  if (cnpj && cooperadoId) await testDoubleSpend(cnpj, cooperadoId, Number(process.env.TEST_AMOUNT_CENTS ?? 100));

  console.log("Concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
