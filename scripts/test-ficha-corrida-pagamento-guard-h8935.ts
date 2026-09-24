/**
 * H8.9.35 — proteção fichaCorrida referenciada por pagamentos (upload operacional).
 * Uso: npm run test:ficha-corrida-pagamento-guard-h8935
 */
import assert from "node:assert/strict";
import {
  preservarFichasReferenciadasPorPagamentos,
  fichasCorridaEquivalentes,
} from "../src/services/fichaCorridaPagamentoGuard.ts";
import {
  preservarPagamentosConfirmados,
} from "../src/services/pagamentoRegistroMerge.ts";
import type { FichaCorrida, PagamentoCooperadoRegistro } from "../src/types/index.ts";

function ficha(id: string, patch?: Partial<FichaCorrida>): FichaCorrida {
  return {
    id,
    cooperativaId: "coop-test",
    cooperadoId: "c_1781981564381_w67gg",
    notaPedidoId: `np_${id}`,
    descricao: `Ficha ${id}`,
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    saldoAcumulado: 100,
    mesReferencia: "2026-08",
    status: "pendente",
    dataLancamento: "2026-08-01",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function pagamento(
  fichaIds: string[],
  status: PagamentoCooperadoRegistro["status"] = "aguardando_confirmacao",
  id = "pg_test"
): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: "coop-test",
    cooperadoId: "c_1781981564381_w67gg",
    mesReferencia: "2026-08",
    valorBruto: fichaIds.length * 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    valorLiquido: fichaIds.length * 100,
    fichaIds,
    notaPedidoIds: fichaIds.map((x) => `np_${x}`),
    status,
    pagoPor: "responsavel",
    pagoEm: "2026-08-15T12:00:00.000Z",
    createdAt: "2026-08-15T12:00:00.000Z",
  };
}

type OpSlice = {
  updatedAt: string;
  pagamentosCooperado: PagamentoCooperadoRegistro[];
  fichaCorrida?: FichaCorrida[];
  arquivosMensais: [];
  comunicados: [];
  mensalidades: [];
  descontos: [];
  config: { descontoPadraoCooperativa: number };
};

function operacional(
  fichaCorrida: FichaCorrida[],
  pagamentos: PagamentoCooperadoRegistro[],
  extra?: Partial<OpSlice>
): OpSlice {
  return {
    updatedAt: new Date().toISOString(),
    pagamentosCooperado: pagamentos,
    fichaCorrida,
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 0 },
    ...extra,
  };
}

function ids(list: FichaCorrida[] | undefined): string[] {
  return (list ?? []).map((x) => x.id);
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`PASS — ${name}`);
}

const ABC = ["A", "B", "C"].map((x) => ficha(x));
const pgAbc = pagamento(["A", "B", "C"]);

test("TESTE 1 — cloud ABC incoming AB → ABC", () => {
  const cloud = operacional(ABC, [pgAbc]);
  const incoming = operacional([ficha("A"), ficha("B")], [pgAbc]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["A", "B", "C"]);
});

test("TESTE 2 — cloud ABC incoming ABD → ABCD", () => {
  const cloud = operacional(ABC, [pgAbc]);
  const incoming = operacional([ficha("A"), ficha("B"), ficha("D")], [pgAbc]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["A", "B", "C", "D"]);
});

test("TESTE 3 — cloud ABC incoming ABC → ABC", () => {
  const cloud = operacional(ABC, [pgAbc]);
  const incoming = operacional(ABC, [pgAbc]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["A", "B", "C"]);
});

test("TESTE 4 — cloud ABC incoming A → ABC", () => {
  const cloud = operacional(ABC, [pgAbc]);
  const incoming = operacional([ficha("A")], [pgAbc]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["A", "B", "C"]);
});

test("TESTE 5 — pg referencia BC incoming só A → ABC", () => {
  const cloud = operacional(ABC, [pagamento(["B", "C"])]);
  const incoming = operacional([ficha("A")], [pagamento(["B", "C"])]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["A", "B", "C"]);
});

test("TESTE 6 — nova ficha D preservada", () => {
  const cloud = operacional(ABC, [pgAbc]);
  const incoming = operacional([...ABC, ficha("D")], [pgAbc]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.ok(ids(payload.fichaCorrida).includes("D"));
});

test("TESTE 7 — pagamento confirmado: ficha protegida; pagamentos inalterados pelo guard", () => {
  const cloudPay = pagamento(["B", "C"], "confirmado");
  const cloud = operacional([ficha("B"), ficha("C")], [cloudPay]);
  const incomingPay = pagamento(["B", "C"], "aguardando_confirmacao");
  const incoming = operacional([], [incomingPay]);
  const { pagamentos: payPayload } = preservarPagamentosConfirmados(
    cloud.pagamentosCooperado,
    incoming.pagamentosCooperado
  );
  const mergedIncoming = { ...incoming, pagamentosCooperado: payPayload };
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, mergedIncoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["B", "C"]);
  assert.equal(payload.pagamentosCooperado[0]!.status, "confirmado");
  assert.equal(payload.pagamentosCooperado[0]!.valorLiquido, cloudPay.valorLiquido);
});

test("TESTE 8 — aguardando_confirmacao: ficha referenciada não some", () => {
  const cloud = operacional([ficha("B"), ficha("C")], [pagamento(["B", "C"], "aguardando_confirmacao")]);
  const incoming = operacional([], [pagamento(["B", "C"], "aguardando_confirmacao")]);
  const { payload, fichasRestauradasDaCloud } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["B", "C"]);
  assert.ok(fichasRestauradasDaCloud.includes("B"));
});

test("TESTE 9 — conteúdo divergente → conflito; cloud preservada", () => {
  const cloud = operacional([ficha("B", { valorLiquido: 100 })], [pagamento(["B"])]);
  const incoming = operacional([ficha("B", { valorLiquido: 999 })], [pagamento(["B"])]);
  const { payload, conflitos } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.equal(conflitos.length, 1);
  assert.equal(conflitos[0]!.motivo, "conteudo_divergente");
  assert.equal(payload.fichaCorrida![0]!.valorLiquido, 100);
});

test("TESTE 10 — incoming sem pagamentosCooperado não apaga fichas protegidas", () => {
  const cloud = operacional([ficha("B"), ficha("C")], [pagamento(["B", "C"])]);
  const incoming = operacional([], []);
  const incomingSemPg = { ...incoming, pagamentosCooperado: undefined as unknown as PagamentoCooperadoRegistro[] };
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incomingSemPg);
  assert.deepEqual(ids(payload.fichaCorrida).sort(), ["B", "C"]);
});

test("TESTE 11 — duplicata inconsistente no incoming", () => {
  const cloud = operacional([ficha("B")], [pagamento(["B"])]);
  const incoming = operacional([ficha("B", { valorLiquido: 1 }), ficha("B", { valorLiquido: 2 })], [pagamento(["B"])]);
  const { payload, conflitos } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.ok(conflitos.some((c) => c.motivo === "duplicata_inconsistente"));
  assert.equal(payload.fichaCorrida!.length, 1);
  assert.equal(payload.fichaCorrida![0]!.valorLiquido, 100);
});

test("REGRESSÃO — guard não altera pagamentosCooperado", () => {
  const cloud = operacional(ABC, [pgAbc]);
  const incoming = operacional([ficha("A")], [pgAbc]);
  const before = JSON.stringify(incoming.pagamentosCooperado);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.equal(JSON.stringify(payload.pagamentosCooperado), before);
});

test("FIXTURE REAL — pg_1790011810612 cloud 36 incoming 0 → 36 preservadas", () => {
  const fichaIds = Array.from({ length: 46 }, (_, i) => `fc_pg179_${String(i + 1).padStart(2, "0")}`);
  const materialized = fichaIds.slice(0, 36).map((id) => ficha(id));
  const pgReal = pagamento(fichaIds, "aguardando_confirmacao", "pg_1790011810612");
  const cloud = operacional(materialized, [pgReal]);
  const incoming = operacional([], [pgReal]);
  const { payload, fichasRestauradasDaCloud } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.equal(payload.fichaCorrida!.length, 36);
  assert.equal(fichasRestauradasDaCloud.length, 36);
  for (const id of fichaIds.slice(0, 36)) {
    assert.ok(payload.fichaCorrida!.some((f) => f.id === id));
  }
});

test("FIXTURE REAL — cloud 36 incoming 36 → 36", () => {
  const fichaIds = Array.from({ length: 46 }, (_, i) => `fc_pg179_${String(i + 1).padStart(2, "0")}`);
  const materialized = fichaIds.slice(0, 36).map((id) => ficha(id));
  const pgReal = pagamento(fichaIds, "aguardando_confirmacao", "pg_1790011810612");
  const cloud = operacional(materialized, [pgReal]);
  const incoming = operacional(materialized, [pgReal]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.equal(payload.fichaCorrida!.length, 36);
});

test("FIXTURE REAL — cloud 36 incoming 36 + novas → 36 + novas", () => {
  const fichaIds = Array.from({ length: 46 }, (_, i) => `fc_pg179_${String(i + 1).padStart(2, "0")}`);
  const materialized = fichaIds.slice(0, 36).map((id) => ficha(id));
  const novas = [ficha("fc_1790155711616_bbahl"), ficha("fc_1790155711617_xxxxx")];
  const pgReal = pagamento(fichaIds, "aguardando_confirmacao", "pg_1790011810612");
  const cloud = operacional(materialized, [pgReal]);
  const incoming = operacional([...materialized, ...novas], [pgReal]);
  const { payload } = preservarFichasReferenciadasPorPagamentos(cloud, incoming);
  assert.equal(payload.fichaCorrida!.length, 38);
  assert.ok(payload.fichaCorrida!.some((f) => f.id === "fc_1790155711616_bbahl"));
});

test("equivalence helper", () => {
  assert.ok(fichasCorridaEquivalentes(ficha("X"), ficha("X")));
  assert.ok(!fichasCorridaEquivalentes(ficha("X"), ficha("X", { valorLiquido: 2 })));
});

console.log(`\n${passed} testes OK (H8.9.35 fichaCorrida pagamento guard).`);
