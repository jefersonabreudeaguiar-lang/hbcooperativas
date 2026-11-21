import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import { prepararLivroCaixaSync } from "../src/services/livroCaixaSyncPayload";
import { criarLancamentoManual, excluirLancamentoLivroCaixa } from "../src/services/livroCaixaService";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import { readFileSync } from "node:fs";

const base = structuredClone(emptyInitialData);
const a = criarLancamentoManual(base, "coop", "credito", 125, "Primeira sessão", { id: "a" });
const b = criarLancamentoManual(base, "coop", "debito", 25, "Segunda sessão", { id: "b" });
const cloud: OperacionalSyncPayload = {
  updatedAt: "2026-11-20T10:00:00Z", arquivosMensais: [], pagamentosCooperado: [],
  mensalidades: [], descontos: [], comunicados: [], config: { descontoPadraoCooperativa: 5 },
  livroCaixa: a.livroCaixa, fichaCorrida: [],
};
const merged = prepararLivroCaixaSync(cloud, b, "coop");
assert.deepEqual(new Set(merged.livroCaixa?.map((l) => l.id)), new Set(["a", "b"]));
assert.equal(prepararLivroCaixaSync(merged, b, "coop").livroCaixa?.length, 2, "reenvio não duplica");
for (const field of ["pagamentosCooperado", "fichaCorrida", "mensalidades", "descontos", "comunicados", "config"] as const) {
  assert.equal(merged[field], cloud[field], `${field} preservado da nuvem`);
}
const deleted = excluirLancamentoLivroCaixa(a, "coop", "a");
assert.equal(prepararLivroCaixaSync(cloud, deleted, "coop").livroCaixa?.length, 0);
const other = criarLancamentoManual(b, "outra", "credito", 999, "Outro CNPJ", { id: "other" });
assert.equal(prepararLivroCaixaSync(cloud, other, "coop").livroCaixa?.length, 2);
const newer = { ...cloud, livroCaixa: cloud.livroCaixa!.map((l) => ({ ...l, valor: 200, updatedAt: "2099-01-01T00:00:00Z" })) };
assert.equal(prepararLivroCaixaSync(newer, a, "coop").livroCaixa?.[0].valor, 200, "edição antiga não substitui a nova");
const automatic = { ...a.livroCaixa![0], id: "payment", origem: "pagamento_cooperado" as const, origemId: "pg_pago", valor: 300 };
const cloudAutomatic = { ...cloud, livroCaixa: [automatic] };
const staleAutomatic = { ...base, livroCaixa: [{ ...automatic, valor: 1 }] };
assert.equal(prepararLivroCaixaSync(cloudAutomatic, staleAutomatic, "coop").livroCaixa?.[0].valor, 300, "pagamento automático não é substituído por memória antiga");
const source = readFileSync("src/services/cooperativaSyncCloudService.ts", "utf8").split("export async function pushLivroCaixaToCloud")[1].split("export async function pushOperacionalToCloud")[0];
assert.equal((source.match(/await fetchSyncBundle\(/g) ?? []).length, 1);
assert.equal((source.match(/await secureApiFetch\(/g) ?? []).length, 1);
assert.ok(source.includes("if (!res.ok)"));
assert.ok(!/fetchCooperados|posProcessarFinanceiro|ensureComunicadosAudio/.test(source));
console.log("PASS: caixa isolado, sessões sequenciais, repetição, exclusão, vínculo, edição obsoleta e uma leitura/uma gravação.");
