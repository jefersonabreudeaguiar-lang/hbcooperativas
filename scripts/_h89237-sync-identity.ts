/**
 * H8.9.237 — Identidade de payload com escopo de push pós-PATCH.
 * npx tsx scripts/_h89237-sync-identity.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import { buildOperacionalPayloadForTests } from "../src/services/cooperativaSyncCloudService.ts";
import {
  applyConferenciaOperacionalPushView,
  enterConferenciaOperacionalPushScope,
  exitConferenciaOperacionalPushScope,
  preserveOperationalTruthDuringConferenciaPushSave,
} from "../src/services/conferenciaOperacionalPushScope.ts";
import {
  enqueueConferenciaAprovacaoSync,
  awaitConferenciaAprovacaoSyncQueueIdle,
  resetConferenciaAprovacaoSyncQueueForTests,
  markConferenciaPatchSyncedForOperacionalPush,
  getConferenciaPatchSyncedSnapshot,
} from "../src/services/conferenciaAprovacaoSyncQueue.ts";

const COOP = "coop-h89237";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildStore(notas: { id: string; status: NotaPedido["status"] }[], fichas: string[], pagamentos?: PagamentoCooperadoRegistro[]): AppData {
  const notasPedido: NotaPedido[] = notas.map((n) => ({
    id: n.id,
    cooperativaId: COOP,
    cooperadoId: "c1",
    cooperadoNomeSnapshot: "C",
    instituicaoId: "i1",
    numeroNota: n.id,
    dataEntrega: "2026-08-01",
    mesReferencia: "2026-08",
    itens: [],
    valorBruto: 10,
    valorDesconto: 0,
    valorLiquido: 10,
    percentualDescontoCooperativa: 5,
    fotosEnviadasCount: 1,
    fotoNaNuvem: true,
    status: n.status,
    createdAt: "",
    updatedAt: "",
  }));
  const fichaCorrida: FichaCorrida[] = fichas.map((notaId) => ({
    id: `fc-${notaId}`,
    cooperativaId: COOP,
    cooperadoId: "c1",
    notaPedidoId: notaId,
    descricao: notaId,
    valorBruto: 10,
    descontos: 0,
    valorLiquido: 10,
    saldoAcumulado: 10,
    mesReferencia: "2026-08",
    status: "pendente",
    dataLancamento: "2026-08-01",
    dataPagamentoPrevista: "2026-08-31",
    responsavelConferencia: "R",
    createdAt: "",
  }));
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      { id: "c1", cooperativaId: COOP, nomeCompleto: "C", cpfCnpj: "1", status: "ativo", createdAt: "", updatedAt: "" },
    ],
    users: [],
    notasPedido,
    fichaCorrida,
    pagamentosCooperado: pagamentos ?? [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "E", createdAt: "", updatedAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    notasPedidoExcluidas: [],
    config: {},
  };
}

function payloadFichaIds(data: AppData): string[] {
  const payload = buildOperacionalPayloadForTests(data, COOP);
  return [...new Set(payload.fichaCorrida.map((f) => f.notaPedidoId).filter(Boolean))].sort() as string[];
}

async function cenario1() {
  resetConferenciaAprovacaoSyncQueueForTests();
  let store = buildStore(
    [
      { id: "n-a", status: "conferida" },
      { id: "n-b", status: "aguardando_conferencia" },
    ],
    ["n-a"]
  );

  const patchLog: string[] = [];
  const pushLog: string[][] = [];

  enqueueConferenciaAprovacaoSync("n-a", async () => {
    await sleep(15);
    patchLog.push("n-a");
    markConferenciaPatchSyncedForOperacionalPush("n-a");
    store = buildStore(
      [
        { id: "n-a", status: "conferida" },
        { id: "n-b", status: "conferida" },
      ],
      ["n-a", "n-b"]
    );
    enterConferenciaOperacionalPushScope(COOP, getConferenciaPatchSyncedSnapshot());
    try {
      const view = applyConferenciaOperacionalPushView(store, COOP, getConferenciaPatchSyncedSnapshot());
      pushLog.push(payloadFichaIds(view));
    } finally {
      exitConferenciaOperacionalPushScope();
    }
  });

  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.deepEqual(patchLog, ["n-a"]);
  assert.deepEqual(pushLog[0], ["n-a"]);
}

async function cenario2() {
  resetConferenciaAprovacaoSyncQueueForTests();
  const store = buildStore(
    [
      { id: "n-a", status: "conferida" },
      { id: "n-b", status: "conferida" },
      { id: "n-c", status: "conferida" },
    ],
    ["n-a", "n-b", "n-c"]
  );

  let active = 0;
  let maxActive = 0;
  const order: string[] = [];

  for (const id of ["n-a", "n-b", "n-c"]) {
    enqueueConferenciaAprovacaoSync(id, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`patch-${id}`);
      await sleep(id === "n-a" ? 40 : 5);
      markConferenciaPatchSyncedForOperacionalPush(id);
      enterConferenciaOperacionalPushScope(COOP, getConferenciaPatchSyncedSnapshot());
      try {
        const view = applyConferenciaOperacionalPushView(store, COOP, getConferenciaPatchSyncedSnapshot());
        order.push(`push-${id}:${payloadFichaIds(view).join(",")}`);
      } finally {
        exitConferenciaOperacionalPushScope();
      }
      active -= 1;
    });
  }

  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.equal(maxActive, 1);
  assert.deepEqual(order, [
    "patch-n-a",
    "push-n-a:n-a",
    "patch-n-b",
    "push-n-b:n-a,n-b",
    "patch-n-c",
    "push-n-c:n-a,n-b,n-c",
  ]);
}

async function cenario3() {
  resetConferenciaAprovacaoSyncQueueForTests();
  const store = buildStore(
    [
      { id: "n-a", status: "conferida" },
      { id: "n-b", status: "conferida" },
      { id: "n-c", status: "conferida" },
    ],
    ["n-a", "n-b", "n-c"]
  );
  const synced: string[] = [];

  enqueueConferenciaAprovacaoSync("n-a", async () => {
    throw new Error("patch-fail-a");
  });
  enqueueConferenciaAprovacaoSync("n-b", async () => {
    markConferenciaPatchSyncedForOperacionalPush("n-b");
    synced.push("n-b");
    enterConferenciaOperacionalPushScope(COOP, getConferenciaPatchSyncedSnapshot());
    try {
      payloadFichaIds(applyConferenciaOperacionalPushView(store, COOP, getConferenciaPatchSyncedSnapshot()));
    } finally {
      exitConferenciaOperacionalPushScope();
    }
  });
  enqueueConferenciaAprovacaoSync("n-c", async () => {
    markConferenciaPatchSyncedForOperacionalPush("n-c");
    synced.push("n-c");
  });

  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.ok(!getConferenciaPatchSyncedSnapshot().has("n-a"));
  assert.deepEqual(synced, ["n-b", "n-c"]);
}

function cenario4() {
  const pg: PagamentoCooperadoRegistro = {
    id: "pg-1",
    cooperativaId: COOP,
    cooperadoId: "c1",
    valorPago: 99,
    dataPagamento: "2026-08-10",
    mesReferencia: "2026-08",
    notaPedidoIds: ["n-old"],
    fichaIds: ["fc-old"],
    pagoPor: "Resp",
    createdAt: "",
  };
  const truth = buildStore([{ id: "n-a", status: "conferida" }, { id: "n-b", status: "conferida" }], ["n-a", "n-b"], [pg]);
  enterConferenciaOperacionalPushScope(COOP, new Set(["n-a"]));
  const view = applyConferenciaOperacionalPushView(truth, COOP, new Set(["n-a"]));
  assert.deepEqual(payloadFichaIds(view), ["n-a"]);
  assert.equal(view.pagamentosCooperado[0]?.valorPago, 99);

  const fakePersist = {
    ...view,
    pagamentosCooperado: [{ ...pg, valorPago: 1 }],
    notasPedido: view.notasPedido.map((n) => ({ ...n, status: "aguardando_conferencia" as const })),
    fichaCorrida: [],
  };
  const restored = preserveOperationalTruthDuringConferenciaPushSave(fakePersist, truth);
  assert.equal(restored.pagamentosCooperado[0]?.valorPago, 1);
  assert.equal(restored.notasPedido.find((n) => n.id === "n-b")?.status, "conferida");
  assert.equal(restored.fichaCorrida.length, 2);
  exitConferenciaOperacionalPushScope();
}

async function main() {
  await cenario1();
  await cenario2();
  await cenario3();
  cenario4();
  console.log("h89237-sync-identity — OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
