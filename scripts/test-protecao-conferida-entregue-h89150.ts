/**
 * H8.9.150 — validação read-only da regra “conferida não volta para entregue”.
 * Simula apenas o guard proposto em shouldApplyCloudNota (produção intacta).
 * npx tsx scripts/test-protecao-conferida-entregue-h89150.ts
 */
import assert from "node:assert/strict";
import type { AppData, NotaPedido } from "../src/types/index.ts";
import { mergeCloudNotasIntoData } from "../src/services/notaPedidoCloudService.ts";
import { relancarEntregaNota } from "../src/services/notaPedidoService.ts";

const CNPJ = "62351750000165";
const COOP = "coop-h89150";
const NOTA_ID = "np-h89150";

/** Guard mínimo proposto (ainda NÃO está em produção). */
function proposedBlockConferidaToEntregueCloud(
  local: NotaPedido,
  cloud: NotaPedido
): boolean {
  return local.status === "conferida" && cloud.status === "entregue";
}

/**
 * Efeito de adicionar o guard em shouldApplyCloudNota:
 * se bloqueado, merge não entra — nota local permanece intacta.
 */
function mergeWithProposedGuard(local: NotaPedido, cloud: NotaPedido): NotaPedido {
  if (proposedBlockConferidaToEntregueCloud(local, cloud)) {
    return local;
  }
  const out = mergeCloudNotasIntoData(baseData([local]), [cloud], CNPJ);
  return out.notasPedido.find((n) => n.id === NOTA_ID)!;
}

function mergeAtual(local: NotaPedido, cloud: NotaPedido): NotaPedido {
  const out = mergeCloudNotasIntoData(baseData([local]), [cloud], CNPJ);
  return out.notasPedido.find((n) => n.id === NOTA_ID)!;
}

function baseData(notas: NotaPedido[]): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: "c1",
        cooperativaId: COOP,
        nomeCompleto: "Coop 1",
        cpfCnpj: "1",
        status: "ativo",
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: notas,
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", cooperativaId: COOP, nome: "Escola", createdAt: "", updatedAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    notasPedidoExcluidas: [],
    config: {},
  } as AppData;
}

function nota(partial: Partial<NotaPedido> & Pick<NotaPedido, "status">): NotaPedido {
  return {
    id: NOTA_ID,
    cooperativaId: COOP,
    cooperadoId: "c1",
    cooperadoNomeSnapshot: "Coop 1",
    instituicaoId: "inst-1",
    numeroNota: "150",
    dataEntrega: "2026-08-01",
    mesReferencia: "2026-08",
    itens: [{ descricao: "X", quantidade: 1, precoUnitario: 10, valorBruto: 10 }],
    valorBruto: 10,
    valorDesconto: 0,
    valorLiquido: 10,
    percentualDescontoCooperativa: 10,
    fotosEnviadasCount: 1,
    fotoNaNuvem: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...partial,
  };
}

type ScenarioResult = {
  expected: string;
  proposed: string;
  atual?: string;
  pass: boolean;
};

const scenarios: Record<string, ScenarioResult> = {};

function record(
  key: string,
  expectedStatus: NotaPedido["status"],
  proposed: NotaPedido,
  atual?: NotaPedido
): void {
  const pass = proposed.status === expectedStatus;
  scenarios[key] = {
    expected: expectedStatus,
    proposed: proposed.status,
    atual: atual?.status,
    pass,
  };
  assert.equal(proposed.status, expectedStatus, `cenário ${key} (proposed guard)`);
}

// A — principal: hoje entregue; com guard → conferida
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    dataConferencia: "2026-08-01",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({ status: "entregue", updatedAt: "2026-08-01T11:00:00.000Z" });
  const atual = mergeAtual(local, cloud);
  const proposed = mergeWithProposedGuard(local, cloud);
  assert.equal(atual.status, "conferida", "A produção H8.9.151");
  record("A", "conferida", proposed, atual);
}

// B
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T11:00:00.000Z",
  });
  const cloud = nota({ status: "entregue", updatedAt: "2026-08-01T10:00:00.000Z" });
  record("B", "conferida", mergeWithProposedGuard(local, cloud), mergeAtual(local, cloud));
}

// C
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({ status: "aguardando_conferencia", updatedAt: "2026-08-01T11:00:00.000Z" });
  record("C", "conferida", mergeWithProposedGuard(local, cloud));
}

// D
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({ status: "rascunho", updatedAt: "2026-08-01T11:00:00.000Z" });
  record("D", "conferida", mergeWithProposedGuard(local, cloud));
}

// E — upgrade pago permitido
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({
    status: "pago",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T11:00:00.000Z",
  });
  record("E", "pago", mergeWithProposedGuard(local, cloud));
}

// F — legacy aguardando + entregue: guard não dispara
{
  const local = nota({ status: "aguardando_conferencia", updatedAt: "2026-08-01T10:00:00.000Z" });
  const cloud = nota({ status: "entregue", updatedAt: "2026-08-01T11:00:00.000Z" });
  const atual = mergeAtual(local, cloud);
  const proposed = mergeWithProposedGuard(local, cloud);
  assert.equal(atual.status, "aguardando_conferencia", "F legacy atual");
  assert.equal(proposed.status, atual.status, "F guard não altera legacy");
  scenarios.F = {
    expected: "aguardando_conferencia (legacy)",
    proposed: proposed.status,
    atual: atual.status,
    pass: true,
  };
}

// G — entregue local + conferida cloud (upgrade)
{
  const local = nota({ status: "entregue", updatedAt: "2026-08-01T10:00:00.000Z" });
  const cloud = nota({
    status: "conferida",
    conferidaPor: "Resp",
    dataConferencia: "2026-08-01",
    updatedAt: "2026-08-01T11:00:00.000Z",
  });
  const atual = mergeAtual(local, cloud);
  const proposed = mergeWithProposedGuard(local, cloud);
  assert.equal(proposed.status, atual.status, "G guard não muda upgrade");
  scenarios.G = {
    expected: "conferida (upgrade atual)",
    proposed: proposed.status,
    atual: atual.status,
    pass: atual.status === "conferida",
  };
  assert.equal(atual.status, "conferida", "G");
}

// H — relançamento: local deixa de ser conferida; guard não interfere
{
  let data = baseData([
    nota({
      status: "conferida",
      conferidaPor: "Resp",
      valorLiquido: 10,
      updatedAt: "2026-08-01T09:00:00.000Z",
    }),
  ]);
  data = {
    ...data,
    fichaCorrida: [
      {
        id: "fc1",
        cooperativaId: COOP,
        cooperadoId: "c1",
        notaPedidoId: NOTA_ID,
        descricao: "N",
        valorBruto: 10,
        descontos: 0,
        valorLiquido: 10,
        saldoAcumulado: 10,
        mesReferencia: "2026-08",
        status: "pendente",
        dataLancamento: "2026-08-01",
        dataPagamentoPrevista: "2026-08-31",
        responsavelConferencia: "Resp",
        createdAt: "",
      },
    ],
  };
  const rel = relancarEntregaNota(data, NOTA_ID, COOP);
  assert.equal(rel.ok, true);
  if (!rel.ok) throw new Error("relancar");
  const localRel = rel.nota;
  assert.equal(localRel.status, "aguardando_conferencia");
  assert.ok(localRel.relancadaEm);

  const cloudEnt = nota({ status: "entregue", updatedAt: "2026-08-01T08:00:00.000Z" });
  const atualRel = mergeAtual(localRel, cloudEnt);
  const proposedRel = mergeWithProposedGuard(localRel, cloudEnt);
  assert.equal(proposedRel.status, "aguardando_conferencia");
  assert.equal(proposedRel.status, atualRel.status);
  assert.ok(!proposedBlockConferidaToEntregueCloud(localRel, cloudEnt));

  scenarios.H = {
    expected: "aguardando_conferencia (relançamento preservado)",
    proposed: proposedRel.status,
    atual: atualRel.status,
    pass: true,
  };
}

const allPass = Object.values(scenarios).every((s) => s.pass);
assert.ok(allPass);

console.log("H8.9.150 proteção conferida→entregue (simulada) — OK");
console.log(
  "Regra simulada: shouldApplyCloudNota return false se local.conferida && cloud.entregue"
);
console.log(JSON.stringify(scenarios, null, 2));
