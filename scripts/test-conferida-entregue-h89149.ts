/**
 * H8.9.149 — caminho conferida → entregue via merge cloud (read-only, in-memory).
 * npx tsx scripts/test-conferida-entregue-h89149.ts
 */
import assert from "node:assert/strict";
import type { AppData, NotaPedido } from "../src/types/index.ts";
import { mergeCloudNotasIntoData } from "../src/services/notaPedidoCloudService.ts";
import {
  isNotaNaFilaConferenciaResponsavel,
  isNotaSaiuDaFilaConferencia,
  isNotaStatusDowngrade,
  NOTA_STATUS_RANK,
} from "../src/utils/notaStatus.ts";
import { relancarEntregaNota } from "../src/services/notaPedidoService.ts";

const CNPJ = "62351750000165";
const COOP = "coop-h89149";
const NOTA_ID = "np-h89149";

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
    numeroNota: "149",
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

function mergeLocal(local: NotaPedido, cloud: NotaPedido): NotaPedido {
  const out = mergeCloudNotasIntoData(baseData([local]), [cloud], CNPJ);
  return out.notasPedido.find((n) => n.id === NOTA_ID)!;
}

function inPendentesTodas(status: NotaPedido["status"]): boolean {
  const n = nota({ status, conferidaPor: status === "conferida" ? "Resp" : undefined });
  return baseData([n]).notasPedido.some((x) => isNotaNaFilaConferenciaResponsavel(x.status));
}

const results: Record<string, "PASS" | "FAIL" | string> = {};

// Sanity: ranks
assert.equal(NOTA_STATUS_RANK.entregue, NOTA_STATUS_RANK.conferida);
assert.equal(isNotaStatusDowngrade("conferida", "entregue"), false);
assert.equal(isNotaStatusDowngrade("conferida", "aguardando_conferencia"), true);

// A — cloud entregue mais novo
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    dataConferencia: "2026-08-01",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({ status: "entregue", updatedAt: "2026-08-01T11:00:00.000Z" });
  const merged = mergeLocal(local, cloud);
  results.A =
    merged.status === "conferida" && !isNotaNaFilaConferenciaResponsavel(merged.status)
      ? "PASS — guard H8.9.151: permanece conferida, fora da fila"
      : `FAIL — status=${merged.status}`;
  assert.equal(merged.status, "conferida", "A");
  assert.ok(isNotaSaiuDaFilaConferencia(merged.status));
  assert.ok(!isNotaNaFilaConferenciaResponsavel(merged.status));
}

// B — cloud entregue mais antigo
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T11:00:00.000Z",
  });
  const cloud = nota({ status: "entregue", updatedAt: "2026-08-01T10:00:00.000Z" });
  const merged = mergeLocal(local, cloud);
  results.B =
    merged.status === "conferida" ? "PASS — mantém conferida" : `FAIL — status=${merged.status}`;
  assert.equal(merged.status, "conferida", "B");
}

// C — aguardando cloud mais novo
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({ status: "aguardando_conferencia", updatedAt: "2026-08-01T12:00:00.000Z" });
  const merged = mergeLocal(local, cloud);
  results.C =
    merged.status === "conferida" ? "PASS — protegido" : `FAIL — status=${merged.status}`;
  assert.equal(merged.status, "conferida", "C");
}

// D — rascunho cloud mais novo
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({ status: "rascunho", updatedAt: "2026-08-01T12:00:00.000Z" });
  const merged = mergeLocal(local, cloud);
  results.D =
    merged.status === "conferida" ? "PASS — protegido" : `FAIL — status=${merged.status}`;
  assert.equal(merged.status, "conferida", "D");
}

// E — pago cloud mais novo
{
  const local = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloud = nota({
    status: "pago",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T12:00:00.000Z",
  });
  const merged = mergeLocal(local, cloud);
  results.E =
    merged.status === "pago" ? "PASS — upgrade para pago" : `FAIL — status=${merged.status}`;
  assert.equal(merged.status, "pago", "E");
}

// F — relancadaEm vs entregue
{
  const localConf = nota({
    status: "conferida",
    conferidaPor: "Resp",
    updatedAt: "2026-08-01T10:00:00.000Z",
  });
  const cloudEnt = nota({ status: "entregue", updatedAt: "2026-08-01T11:00:00.000Z" });
  const semRel = mergeLocal(localConf, cloudEnt);
  assert.equal(semRel.status, "conferida");

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
  const mergedRel = mergeCloudNotasIntoData(rel.data, [cloudEnt], CNPJ).notasPedido[0];
  results.F =
    semRel.status === "conferida" && mergedRel.status === "aguardando_conferencia"
      ? "PASS — sem relancadaEm→conferida; com relançamento local→aguardando"
      : `FAIL sem=${semRel.status} rel=${mergedRel.status}`;
}

assert.ok(inPendentesTodas("entregue"), "entregue ∈ pendentesTodas filter");

console.log("H8.9.149 conferida→entregue — OK");
console.log("NOTA_STATUS_RANK", NOTA_STATUS_RANK);
console.log(JSON.stringify(results));
