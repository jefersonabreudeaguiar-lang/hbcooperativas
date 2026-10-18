/**
 * Início: aviso de backup volta; restore não zera o aparelho antes de puxar a nuvem.
 * npx tsx scripts/test-inicio-restore-nao-retrocede-v482.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData, FichaCorrida, PagamentoCooperadoRegistro } from "../src/types";
import { operacionalRestoreRetrocedeu } from "../src/services/operacionalRestoreService.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const restoreSrc = readFileSync(join(ROOT, "src/services/operacionalRestoreService.ts"), "utf8");
const dash = readFileSync(join(ROOT, "src/app/(app)/dashboard/DashboardContent.tsx"), "utf8");
const version = readFileSync(join(ROOT, "src/lib/appBuildVersion.ts"), "utf8");

assert.match(version, /APP_BUILD_VERSION = 482/, "build 482");
assert.match(dash, /<RestoreOperacionalPanel cnpj=\{cnpj\} coopId=\{coopId\} \/>/, "aviso no Início");
assert.match(
  restoreSrc,
  /operacionalRestoreRetrocedeu\(before, after, cid\)/,
  "restore desfaz se retroceder"
);
assert.doesNotMatch(
  restoreSrc,
  /clearOperacionalFinanceiroForCooperativa/,
  "restore não zera financeiro antes do pull"
);
assert.doesNotMatch(
  restoreSrc,
  /resetCloudSyncMarkersForRestore/,
  "restore não reabre reset v15 para wipe"
);

const COOP = "coop-r";
const COOPERADO = "c_r";

function pag(id: string): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: "2026-10",
    status: "confirmado",
    valorBruto: 10,
    valorLiquido: 10,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: [],
    notaPedidoIds: [],
    pagoEm: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function ficha(id: string): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: "n1",
    mesReferencia: "2026-10",
    status: "pendente",
    valorBruto: 10,
    descontos: 0,
    valorLiquido: 10,
    descricao: id,
    dataLancamento: "2026-10-01",
    createdAt: "2026-10-01T00:00:00.000Z",
  } as FichaCorrida;
}

function data(pags: PagamentoCooperadoRegistro[], fichas: FichaCorrida[]): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "R", status: "ativo", createdAt: "" }],
    users: [],
    notasPedido: [],
    fichaCorrida: fichas,
    pagamentosCooperado: pags,
    descontos: [],
    mensalidades: [],
    arquivosMensais: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

const before = data([pag("p1"), pag("p2")], [ficha("f1")]);
const afterWipe = data([], []);
const afterForward = data([pag("p1"), pag("p2"), pag("p3")], [ficha("f1")]);

assert.equal(operacionalRestoreRetrocedeu(before, afterWipe, COOP), true, "wipe retrocede");
assert.equal(operacionalRestoreRetrocedeu(before, afterForward, COOP), false, "puxar 38 pagamentos não retrocede");
assert.equal(operacionalRestoreRetrocedeu(afterWipe, afterForward, COOP), false, "0→N é avanço");

console.log("ok: aviso no Início; restore v482 não zera nem retrocede");
