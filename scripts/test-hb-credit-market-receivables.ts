import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketReceivableSnapshot, parseMarketReceivableSnapshot } from "../src/lib/supabase/hbCreditMarketReceivableSnapshot";

const summary = { partnerId: "market", abertoCents: 900, elegivelCents: 18900, aReceberCents: 19800, emProcessamentoCents: 900, emRevisaoCents: 900, liquidadoCents: 900, totalPendenteCents: 21600, quantidadePendente: 24, aguardandoConfirmacaoCents: 900, porMes: [{ mesReferencia: "2026-09", aReceberCents: 19800, emProcessamentoCents: 900, emRevisaoCents: 900 }] };
const raw = { asOf: "2026-11-01T12:00:00Z", integrityErrors: 0, summaries: [summary], recentReceivables: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, partnerId: "market", amountCents: 900, status: "ELIGIBLE", createdAt: "2026-09-02T00:00:00Z" })) };
const parsed = parseMarketReceivableSnapshot(raw, "market");
assert.equal(parsed.summaries[0].aReceberCents, 19800);
assert.equal(parsed.recentReceivables.reduce((n, r) => n + r.amountCents, 0), 18000, "A lista limitada não determina o saldo");
assert.equal(parsed.summaries[0].totalPendenteCents, 21600, "Não somar novamente a liquidação aguardando confirmação");
for (const bad of [null, {}, { ...raw, integrityErrors: 1 }, { ...raw, summaries: [] }, { ...raw, summaries: [{ ...summary, aReceberCents: 0 }] }, { ...raw, summaries: [{ ...summary, porMes: [] }] }, { ...raw, summaries: [{ ...summary, liquidadoCents: -1 }] }, { ...raw, recentReceivables: [{ ...raw.recentReceivables[0], status: "UNKNOWN" }] }]) {
  assert.throws(() => parseMarketReceivableSnapshot(bad, "market"));
}
assert.throws(() => parseMarketReceivableSnapshot(raw, "other-market"));
const fake = (data: unknown, error: unknown) => ({ rpc: async (_name: string, args: unknown) => { assert.deepEqual(args, { p_cnpj: "11111111111111", p_partner_id: "market" }); return { data, error }; } }) as unknown as SupabaseClient;
async function main() {
  assert.equal((await getMarketReceivableSnapshot(fake(raw, null), "11111111111111", "market")).summaries[0].aReceberCents, 19800);
  await assert.rejects(getMarketReceivableSnapshot(fake(null, { message: "offline" }), "11111111111111", "market"));
  await assert.rejects(getMarketReceivableSnapshot(fake(null, null), "11111111111111", "market"));
  await assert.rejects(getMarketReceivableSnapshot(fake(raw, null), "", "market"));
  console.log("PASS: totais independentes da página, sem duplicação, dados inválidos recusados, escopo do mercado e falha sem saldo zero.");
}
void main();
