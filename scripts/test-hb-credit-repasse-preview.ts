import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmAppRepasse, getAppRepassePreview } from "../src/lib/supabase/contaCoopStorage";
import { getAppRepasseSnapshot } from "../src/lib/supabase/hbCreditAppRepasseSnapshot";

const cnpj = "11111111111111";
const paid = { id: "paid", cooperative_cnpj: cnpj, mes_referencia: "2026-11", amount_cents: 30,
  responsavel_nome: "Fixture", livro_caixa_origem_id: "book-paid", paid_at: "2026-11-01T12:00:00Z" };
function client(existing: unknown, count = 0, amount = 0, integrityErrors = 0, error: unknown = null) {
  return { rpc: async (name: string, input: Record<string, unknown>) => {
    assert.equal(name, "hb_credit_app_repasse_snapshot", "Não deve confirmar antes de conferir o fechamento");
    assert.equal(input.p_cooperative_cnpj, cnpj);
    assert.equal(input.p_mes_referencia, "2026-11");
    return { data: { ok: true, existingRepasse: existing, pendingAmountCents: amount,
      pendingCount: count, integrityErrors }, error };
  } } as unknown as SupabaseClient;
}
async function main() {
  const closed = await getAppRepassePreview(client(paid), cnpj, "2026-11");
  assert.equal(closed.alreadyPaid, true);
  const late = await getAppRepassePreview(client(paid, 1501, 45030), cnpj, "2026-11");
  assert.equal(late.alreadyPaid, false);
  assert.equal(late.requerConferenciaFechamento, true);
  assert.equal(late.allocCount, 1501);
  assert.equal(late.repasse?.livroCaixaOrigemId, "book-paid");
  const full = await getAppRepasseSnapshot(client(null, 1501, 45030), cnpj, "2026-11");
  assert.equal(full.amountCents, 45030, "Resumo não pode depender da primeira página");
  const empty = await getAppRepassePreview(client(null), cnpj, "2026-11");
  assert.equal(empty.amountCents, 0);
  assert.equal(empty.alreadyPaid, false);
  for (const broken of [
    client(paid, 0, 0, 0, { message: "offline" }),
    client(null, 1, 30, 1),
    client(null, 1, 0),
    client(null, 0, 30),
    client(null, 1, Number.MAX_SAFE_INTEGER + 1),
    client({ ...paid, cooperative_cnpj: "22222222222222" }),
  ]) await assert.rejects(getAppRepassePreview(broken, cnpj, "2026-11"));
  await assert.rejects(getAppRepassePreview(client(null), cnpj, "2026-13"));
  const blocked = await confirmAppRepasse(client(paid, 1501, 45030), {
    cnpj, mesReferencia: "2026-11", responsavelUserId: "fixture", responsavelNome: "Fixture",
  });
  assert.equal(blocked.ok, false, "POST também respeita bloqueio de fechamento");
  console.log("PASS: soma completa, dados inválidos recusados, descontos posteriores não quitados e confirmação respeita conferência.");
}
void main();
