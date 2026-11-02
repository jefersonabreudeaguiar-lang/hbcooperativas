import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppRepassePreview } from "../src/lib/supabase/contaCoopStorage";

const paid = { id: "paid", mes_referencia: "2026-11", amount_cents: 30,
  responsavel_nome: "Fixture", livro_caixa_origem_id: "book-paid", paid_at: "2026-11-01T12:00:00Z" };
function client(existing: unknown, count: number | null, allocationError: unknown = null, existingError: unknown = null) {
  return { from: (table: string) => {
    const reply = table === "hb_credit_app_repasse"
      ? { data: existing, error: existingError }
      : { data: [], count, error: allocationError };
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "neq", "gt"]) query[method] = () => query;
    query.maybeSingle = async () => reply;
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(reply).then(resolve);
    return query;
  } } as unknown as SupabaseClient;
}
async function main() {
  const closed = await getAppRepassePreview(client(paid, 0), "11111111111111", "2026-11");
  assert.equal(closed.alreadyPaid, true);
  const late = await getAppRepassePreview(client(paid, 1501), "11111111111111", "2026-11");
  assert.equal(late.alreadyPaid, false, "Repasse anterior não quita descontos posteriores");
  assert.equal(late.requerConferenciaFechamento, true);
  assert.equal(late.allocCount, 1501, "Contagem exata não fica limitada à página de dados");
  assert.equal(late.repasse?.livroCaixaOrigemId, "book-paid");
  await assert.rejects(getAppRepassePreview(client(paid, null), "11111111111111", "2026-11"));
  await assert.rejects(getAppRepassePreview(client(paid, 0, { message: "offline" }), "11111111111111", "2026-11"));
  await assert.rejects(getAppRepassePreview(client(null, 0, null, { message: "offline" }), "11111111111111", "2026-11"));
  await assert.rejects(getAppRepassePreview(client(null, 0, { message: "offline" }), "11111111111111", "2026-11"));
  console.log("PASS: descontos posteriores não aparecem como quitados; contagem exata e falhas sem confirmação falsa.");
}
void main();
