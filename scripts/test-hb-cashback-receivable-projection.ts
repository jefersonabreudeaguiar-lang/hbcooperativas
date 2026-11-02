import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCashbackLedgerReceivables, projectCashbackLedgerReceivables } from "../src/lib/supabase/hbCreditCashbackReceivableProjection";

const base = { updatedAt: "2026-11-01T12:00:00Z", pagamentosCooperado: [], valoresAvulsosReceber: [] } as unknown as OperacionalSyncPayload;
const entry = { id: "credit", cooperadoId: "member", mesReferencia: "2026-11", amountCents: 800, createdAt: "2026-11-01T12:00:00Z" };
const raw = { cooperativaId: "coop", entries: [entry] };
async function main() {
  const recovered = mergeCashbackLedgerReceivables(base, raw)!;
  assert.equal(recovered.valoresAvulsosReceber?.[0].valor, 8);
  assert.equal(recovered.valoresAvulsosReceber?.[0].status, "pendente");
  assert.equal(mergeCashbackLedgerReceivables(recovered, raw)?.valoresAvulsosReceber?.length, 1);
  const paid = structuredClone(recovered);
  paid.valoresAvulsosReceber![0].status = "pago";
  paid.valoresAvulsosReceber![0].dataPagamento = "2026-11-02";
  assert.equal(mergeCashbackLedgerReceivables(base, raw, paid)?.valoresAvulsosReceber?.[0].status, "pago",
    "Cópia antiga do aparelho não reabre crédito já pago");
  assert.equal(mergeCashbackLedgerReceivables(paid, raw)?.valoresAvulsosReceber?.[0].dataPagamento, "2026-11-02");
  const otherPayment = { ...base, pagamentosCooperado: [{ cooperativaId: "coop", cooperadoId: "member",
    mesReferencia: "2026-11", status: "confirmado", pagoEm: "2026-11-02T12:00:00Z" }] } as OperacionalSyncPayload;
  assert.equal(mergeCashbackLedgerReceivables(otherPayment, raw)?.valoresAvulsosReceber?.[0].status, "pendente",
    "Um pagamento no mesmo mês não prova quitação deste crédito");
  for (const invalid of [null, {}, { ...raw, cooperativaId: null }, { ...raw, entries: [entry, entry] },
    { ...raw, entries: [{ ...entry, amountCents: -1 }] }, { ...raw, entries: [{ ...entry, mesReferencia: "2026-13" }] }]) {
    assert.throws(() => mergeCashbackLedgerReceivables(base, invalid));
  }
  assert.throws(() => mergeCashbackLedgerReceivables(null, raw), "Falha de leitura não cria operacional vazio");
  const collision = structuredClone(recovered);
  collision.valoresAvulsosReceber![0].cooperativaId = "other";
  assert.throws(() => mergeCashbackLedgerReceivables(collision, raw));
  const oldFlag = process.env.HB_CASHBACK_LEDGER_PROJECTION;
  process.env.HB_CASHBACK_LEDGER_PROJECTION = "true";
  try {
    const client = { rpc: async (name: string, args: unknown) => {
      assert.equal(name, "hb_credit_cashback_receivables_snapshot");
      assert.deepEqual(args, { p_cnpj: "11111111111111" });
      return { data: raw, error: null };
    } } as unknown as SupabaseClient;
    assert.equal((await projectCashbackLedgerReceivables(client, "11111111111111", base))?.valoresAvulsosReceber?.length, 1);
    const offline = { rpc: async () => ({ data: null, error: { message: "offline" } }) } as unknown as SupabaseClient;
    await assert.rejects(projectCashbackLedgerReceivables(offline, "11111111111111", base));
  } finally {
    if (oldFlag === undefined) delete process.env.HB_CASHBACK_LEDGER_PROJECTION;
    else process.env.HB_CASHBACK_LEDGER_PROJECTION = oldFlag;
  }
  console.log("PASS: cashback recuperado sem cópia local, sem duplicação, pago preservado, escopo conferido e consulta falha sem inventar saldo.");
}
void main();
