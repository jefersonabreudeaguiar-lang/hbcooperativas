import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { emptyInitialData } from "../src/mock/data";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { OPERATIONAL_RESET_VERSION } from "../src/services/operationalReset";
import type { AppData } from "../src/types";

async function main() {
  const cnpj = "99999999999999";
  const coopId = "11111111-1111-4111-8111-111111111111";
  const coop = { id: coopId, cnpj, nome: "Fixture" };
  const operational = {
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    updatedAt: "2026-11-03T12:00:00Z",
    pagamentosCooperado: [{ id: "payment", cooperativaId: coopId, cooperadoId: "member", status: "confirmado", mesReferencia: "2026-10", valor: 100 }],
    valoresAvulsosReceber: [{ id: "settled", cooperativaId: coopId, cooperadoId: "member", status: "pago", mesReferencia: "2026-10", natureza: "debito", valor: 20 }],
  };
  const mocks = {
    getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ data: [coop] }) }) }) }),
    fetchNotasFromTable: async () => ({ notas: [], tableMissing: false }),
    fetchCooperadosFromStorage: async () => [{ id: "member", nomeCompleto: "Fixture member" }],
    fetchOperacionalSync: async () => operational,
    cooperativaFromCloudRow: () => coop,
    mergeOperacionalIntoData,
    emptyInitialData: structuredClone(emptyInitialData),
    normalizeCnpj: (value: string) => value.replace(/\D/g, ""),
    invalidateJefersonRebuildCloudCache: () => {},
    writeJefersonRebuildCloudCache: () => {},
  };
  const exports: { buildJefersonRebuildCloudAppData?: (cnpj: string, opts: object) => Promise<{data: AppData; cooperativaId: string}> } = {};
  const source = readFileSync("src/lib/cooperado/jefersonRebuild/server/buildJefersonRebuildCloudAppData.ts", "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: () => mocks });
  for (const scope of ["inicio", "full"]) {
    const result = await exports.buildJefersonRebuildCloudAppData!(cnpj, { bypassCache: true, scope });
    assert.equal(result.cooperativaId, coopId);
    const payment = result.data.pagamentosCooperado.find(p => p.id === "payment");
    assert.equal(payment?.cooperativaId, coopId, "Pagamento deve permanecer na cooperativa UUID, nunca no CNPJ");
    const debit = result.data.valoresAvulsosReceber.find(p => p.id === "settled");
    assert.equal(debit?.cooperativaId, coopId, "Débito acertado deve permanecer visível no escopo correto");
    assert.equal(debit?.status, "pago");
  }
  console.log("PASS: montagem da nuvem preserva pagamentos e avulsos acertados no UUID da cooperativa, no início e na leitura completa.");
}
void main();
