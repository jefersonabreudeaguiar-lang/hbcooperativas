import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeRepasseBookRecords } from "../src/lib/supabase/hbCreditOperacionalFinancialProjection";
import { fetchOperacionalSync, uploadOperacionalSync, type OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";

const base: OperacionalSyncPayload = { updatedAt: "2026-11-01T12:00:00Z", arquivosMensais: [], pagamentosCooperado: [],
  comunicados: [], mensalidades: [], descontos: [], config: { descontoPadraoCooperativa: 5 } };
const row = { id: "repasse", originId: "hb_app_repasse", month: "2026-10", amountCents: 12345,
  paidAt: "2026-11-02T01:00:00Z", date: "2026-11-01", responsavel: "Fixture" };
const book = { cooperativaId: "coop", entries: [row] };
async function main() {
  const recovered = mergeRepasseBookRecords(base, book)!;
  assert.equal(recovered.livroCaixa?.length, 1);
  assert.equal(recovered.livroCaixa?.[0].valor, 123.45);
  assert.equal(recovered.livroCaixa?.[0].data, "2026-11-01");
  assert.equal(recovered.livroCaixa?.[0].mesReferencia, "2026-10", "Fechamento de mês anterior permanece recuperável");
  assert.deepEqual(mergeRepasseBookRecords(recovered, book), recovered);
  const previous = structuredClone(recovered);
  previous.livroCaixa![0].id = "id-original";
  previous.livroCaixa![0].numeroSequencia = 42;
  previous.livroCaixa![0].anoSequencia = 2026;
  const stale = structuredClone(recovered);
  stale.livroCaixa![0].valor = 999;
  stale.livroCaixa!.push({ ...stale.livroCaixa![0], id: "duplicado" });
  stale.livroCaixaExcluidos = [{ id: "id-original", cooperativaId: "coop" }];
  const corrected = mergeRepasseBookRecords(stale, book, previous)!;
  assert.equal(corrected.livroCaixa?.length, 1);
  assert.equal(corrected.livroCaixa?.[0].id, "id-original");
  assert.equal(corrected.livroCaixa?.[0].numeroSequencia, 42);
  assert.equal(corrected.livroCaixa?.[0].valor, 123.45);
  assert.equal(corrected.livroCaixaExcluidos?.length, 0);
  assert.equal(mergeRepasseBookRecords(base, book, previous)?.livroCaixa?.[0].numeroSequencia, 42);
  assert.throws(() => mergeRepasseBookRecords(null, book), "Não pode substituir arquivo ilegível por um arquivo vazio");
  for (const invalid of [{ ...book, entries: [row, row] }, { ...book, entries: [{ ...row, amountCents: 0 }] },
    { ...book, entries: [{ ...row, month: "2026-13" }] }, { ...book, entries: [{ ...row, paidAt: "invalid" }] }]) {
    assert.throws(() => mergeRepasseBookRecords(base, invalid));
  }
  const wrongCoop = structuredClone(recovered);
  wrongCoop.livroCaixa![0].cooperativaId = "other";
  assert.throws(() => mergeRepasseBookRecords(wrongCoop, book));
  const many = { ...book, entries: Array.from({ length: 1501 }, (_, n) => ({ ...row, id: `r${n}`, originId: `hb_app_r${n}` })) };
  assert.equal(mergeRepasseBookRecords(base, many)?.livroCaixa?.length, 1501);

  const oldFlag = process.env.HB_FINANCIAL_LEDGER_PROJECTION;
  process.env.HB_FINANCIAL_LEDGER_PROJECTION = "true";
  let uploads = 0;
  let offline = false;
  let missingFile = false;
  let stored = structuredClone(base);
  const client = {
    rpc: async (name: string, input: unknown) => {
      assert.equal(name, "hb_credit_operational_financial_snapshot");
      assert.deepEqual(input, { p_cnpj: "11111111111111" });
      return { data: { ok: true, cashback: { cooperativaId: "coop", entries: [] }, book },
        error: offline ? { message: "offline" } : null };
    },
    storage: {
      listBuckets: async () => ({ data: [{ name: "hb-cooperativa-sync", file_size_limit: 50 * 1024 * 1024 }] }),
      from: () => ({
        download: async () => ({ data: missingFile ? null : new Blob([JSON.stringify(stored)]), error: null }),
        upload: async (_path: string, value: string) => { uploads++; stored = JSON.parse(value); return { error: null }; },
      }),
    },
  } as unknown as SupabaseClient;
  try {
    assert.equal((await fetchOperacionalSync(client, "11111111111111"))?.livroCaixa?.[0].valor, 123.45);
    assert.equal((await uploadOperacionalSync(client, "11111111111111", base)).ok, true);
    assert.equal(stored.livroCaixa?.length, 1, "Push antigo não apaga repasse confirmado");
    offline = true;
    await assert.rejects(uploadOperacionalSync(client, "11111111111111", base));
    assert.equal(uploads, 1, "Falha na conferência não publica arquivo incompleto");
    offline = false;
    missingFile = true;
    await assert.rejects(fetchOperacionalSync(client, "11111111111111"));
  } finally {
    if (oldFlag === undefined) delete process.env.HB_FINANCIAL_LEDGER_PROJECTION;
    else process.env.HB_FINANCIAL_LEDGER_PROJECTION = oldFlag;
  }
  console.log("PASS: repasse recuperável, mês fechado preservado, saldo canônico, sem duplicar, sequência mantida e push antigo/falha sem apagar o caixa.");
}
void main();
