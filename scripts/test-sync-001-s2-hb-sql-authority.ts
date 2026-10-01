/**
 * SYNC-001/S2 — HB SQL autoridade × projeção operacional (in-memory).
 * npx tsx scripts/test-sync-001-s2-hb-sql-authority.ts
 */
import assert from "node:assert/strict";
import type { AppData, ArquivoMensalCooperado } from "../src/types";
import {
  liquidoUsoContaCoopMes,
  mergeContaCoopDescontosFieldSync,
  dedupeDescontosContaCoopRemotos,
  type DescontoContaCoopRemoto,
} from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import {
  resolveDescontosContaCoopMesParaCalculo,
  setContaCoopDescontosMemoria,
} from "../src/lib/hb-credit/contaCoopDescontosMemory.ts";
import {
  markContaCoopDescontosFetchFailed,
  markContaCoopDescontosMesFetchOk,
  clearContaCoopDescontosMesFetchAutoritativo,
} from "../src/lib/hb-credit/contaCoopDescontosSyncHealth.ts";
import {
  getDescontosContaCoopMesCached,
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  getResumoPagamentoParaRegistro,
  mergeArquivosMensaisFromCloud,
  persistDescontosContaCoopNoArquivo,
} from "../src/services/notaPedidoService.ts";

const COOP = "coop-s2";
const COOPERADO = "c_s2";
const MES = "2026-09";

function baseData(partial: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "S2",
        cpf: "000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [
      {
        id: "n1",
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        mesReferencia: MES,
        status: "conferida",
        valorBruto: 500,
        valorLiquido: 500,
        instituicaoId: "i1",
        itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500 }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    fichaCorrida: [
      {
        id: "f1",
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        notaPedidoId: "n1",
        mesReferencia: MES,
        status: "pendente",
        valorBruto: 500,
        descontos: 0,
        valorLiquido: 500,
        descricao: "Entrega",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
    ...partial,
  } as AppData;
}

function compra(
  valor: number,
  id?: string,
  createdAt = "2026-09-10T12:00:00.000Z"
): DescontoContaCoopRemoto {
  return {
    motivo: id
      ? `Compra HB Créditos — Mercado (${id.slice(-8)})`
      : "Compra HB stale operacional",
    valorReais: valor,
    tipo: "conta_coop",
    createdAt,
    ...(id ? { hbTransactionId: id } : {}),
  };
}

function estorno(valor: number, id: string, createdAt = "2026-09-10T13:00:00.000Z"): DescontoContaCoopRemoto {
  return {
    motivo: `Estorno HB Créditos — Mercado (${id.slice(-8)})`,
    valorReais: valor,
    tipo: "conta_coop",
    createdAt,
    hbTransactionId: id,
  };
}

function sqlToMemoria(sql: DescontoContaCoopRemoto[]): void {
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, sql);
}

function mergeCloudArquivo(
  data: AppData,
  local: ArquivoMensalCooperado,
  cloudPatch: Partial<ArquivoMensalCooperado>
): AppData {
  const cloud = { ...local, ...cloudPatch, updatedAt: cloudPatch.updatedAt ?? "2026-09-20T12:00:00.000Z" };
  const merged = mergeArquivosMensaisFromCloud(data, [local], [cloud]);
  return { ...data, arquivosMensais: merged };
}

clearContaCoopDescontosMesFetchAutoritativo(COOP, COOPERADO, MES);

// 1) SQL vazio + operacional R$100 → fetch autoritativo → R$0 financeiro
{
  let data = baseData();
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [compra(100)]);
  sqlToMemoria([]);
  markContaCoopDescontosMesFetchOk(COOP, COOPERADO, MES);
  const cached = getDescontosContaCoopMesCached(data, COOPERADO, MES, COOP);
  assert.equal(liquidoUsoContaCoopMes(cached), 0);
  assert.equal(getResumoPagamentoExibicao(data, COOPERADO, MES, COOP).valorLiquido, 500);
  clearContaCoopDescontosMesFetchAutoritativo(COOP, COOPERADO, MES);
}

// 2) SQL vazio + operacional R$100 + fetch falhou → fallback arquivo
{
  let data = baseData();
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [compra(100)]);
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, []);
  markContaCoopDescontosFetchFailed(COOP, COOPERADO, "offline", MES);
  const cached = getDescontosContaCoopMesCached(data, COOPERADO, MES, COOP);
  assert.equal(liquidoUsoContaCoopMes(cached), 100);
}

// 3–5) merge direto SQL × operacional
{
  const sql = [compra(100, "tx_100")];
  assert.equal(liquidoUsoContaCoopMes(mergeContaCoopDescontosFieldSync([], sql)), 100);
  assert.equal(liquidoUsoContaCoopMes(mergeContaCoopDescontosFieldSync(sql, [])), 100);
  const dup = mergeContaCoopDescontosFieldSync(sql, [...sql, compra(100, "tx_100")]);
  assert.equal(liquidoUsoContaCoopMes(dup), 100);
}

// 6–7) compra + estorno líquido
{
  const lines = dedupeDescontosContaCoopRemotos([
    compra(100, "tx_p"),
    estorno(100, "tx_r"),
  ]);
  assert.equal(liquidoUsoContaCoopMes(lines), 0);
  const partial = dedupeDescontosContaCoopRemotos([compra(100, "tx_p2"), estorno(50, "tx_r2")]);
  assert.equal(liquidoUsoContaCoopMes(partial), 50);
}

// 8) mesma transação duas vezes
{
  const tx = compra(100, "tx_dup");
  const once = mergeContaCoopDescontosFieldSync([tx], [tx]);
  assert.equal(once.length, 1);
}

// 9) operacional timestamp maior sem SQL → merge sync não cria compra
{
  let data = baseData();
  const local = {
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: MES,
    notaPedidoIds: ["n1"],
    pagamentoIds: [],
    updatedAt: "2026-09-05T10:00:00.000Z",
  } as ArquivoMensalCooperado;
  data = { ...data, arquivosMensais: [local] };
  data = mergeCloudArquivo(data, local, {
    contaCoopDescontos: [
      {
        motivo: "Compra HB stale nuvem",
        valorReais: 100,
        tipo: "conta_coop",
        createdAt: "2026-09-15T10:00:00.000Z",
      },
    ],
    contaCoopDescontosUpdatedAt: "2026-09-15T10:00:00.000Z",
  });
  const row = data.arquivosMensais.find((a) => a.mesReferencia === MES);
  assert.equal(row?.contaCoopDescontos?.length ?? 0, 0);
  assert.equal(liquidoUsoContaCoopMes(getDescontosContaCoopMesCached(data, COOPERADO, MES, COOP)), 0);
}

// 10) SQL autoritativo vence operacional stale no cálculo
{
  let data = baseData();
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [compra(100)]);
  sqlToMemoria([compra(100, "tx_sql")]);
  markContaCoopDescontosMesFetchOk(COOP, COOPERADO, MES);
  assert.equal(liquidoUsoContaCoopMes(getDescontosContaCoopMesCached(data, COOPERADO, MES, COOP)), 100);
  clearContaCoopDescontosMesFetchAutoritativo(COOP, COOPERADO, MES);
}

// 11–12) cooperado × responsável mesmo valor (HB no registro = exibição)
{
  let data = baseData();
  sqlToMemoria([compra(80, "tx_80")]);
  markContaCoopDescontosMesFetchOk(COOP, COOPERADO, MES);
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [compra(999)]);
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  const resp = getResumoPagamentoParaRegistro(base, data, COOPERADO, MES, COOP);
  const coop = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.equal(resp.valorLiquido, coop.valorLiquido);
  assert.equal(coop.valorLiquido, 420);
  clearContaCoopDescontosMesFetchAutoritativo(COOP, COOPERADO, MES);
}

// 13) histórico — dedupe não duplica linha de exibição
{
  const lines = mergeContaCoopDescontosFieldSync(
    [compra(40, "tx_h")],
    [compra(40, "tx_h"), compra(40, "tx_h")]
  );
  assert.equal(lines.length, 1);
}

// 14) resolveDescontos — poll vazio sem autoridade mantém arquivo (HB-002 compat)
{
  const arquivo = [compra(30)];
  const resolved = resolveDescontosContaCoopMesParaCalculo(arquivo, [], true, false);
  assert.equal(liquidoUsoContaCoopMes(resolved), 30);
}

console.log("OK — test-sync-001-s2-hb-sql-authority");
