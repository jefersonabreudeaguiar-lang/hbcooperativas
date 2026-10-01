/**
 * BIC × SYNC-001 — contrato read-only / compute (in-memory).
 * npx tsx scripts/test-bic-sync-contract.ts
 */
import assert from "node:assert/strict";
import type { AppData, Desconto, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  buildMinimalAppDataForCreditBase,
  buildCreditosBaseAuthoritativeFromCloud,
} from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import {
  buildCreditosBaseMap,
  resetCreditosBaseMapCache,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { prepararAppDataParaCreditoBaseHb } from "../src/modules/hb-credit/engine/creditBaseHbGuard.ts";
import {
  hbCreditCreditoBaseReais,
  hbCreditValorAReceberAgregado,
} from "../src/lib/hb-credit/hbCreditLeituraBic.ts";
import { bicCentralValorAReceberAgregado } from "../src/services/bicLeituraCentralCooperado.ts";
import { mergeContaCoopDescontosFieldSync } from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import { operacionalDominioFornecidoNoPayload } from "../src/services/operacionalMergeSemantics.ts";
import { syncOperacionalPullPipelineForTests } from "../src/services/cooperativaSyncCloudService.ts";
import {
  clearCloudResetAppliedVersionForTests,
  setCloudResetAppliedVersionForTests,
} from "../src/services/operationalReset.ts";
import { mergePagamentoCooperadoRecord } from "../src/services/pagamentoRegistroMerge.ts";

const COOP = "coop-bic";
const COOPERADO = "c_bic";
const MES = "2026-09";
const CNPJ = "62351750000165";
const VER = 20;

function pag(status: PagamentoCooperadoRegistro["status"], updatedAt: string): PagamentoCooperadoRegistro {
  return {
    id: "p_bic",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    status,
    valorBruto: 100,
    valorLiquido: 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f_bic"],
    notaPedidoIds: ["n_bic"],
    pagoEm: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

function mkNota(): NotaPedido {
  return {
    id: "n_bic",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "i1",
    numeroNota: "1",
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 500,
    valorLiquido: 500,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500, valorBruto: 500 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  } as NotaPedido;
}

function mkFicha(): FichaCorrida {
  return {
    id: "f_bic",
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: "n_bic",
    mesReferencia: MES,
    status: "pendente",
    valorBruto: 500,
    descontos: 0,
    valorLiquido: 500,
    descricao: "n_bic",
    dataLancamento: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
  } as FichaCorrida;
}

function desconto(id: string): Desconto {
  return {
    id,
    cooperadoId: COOPERADO,
    tipo: "manual",
    motivo: "M",
    data: "2026-09-01",
    responsavel: "a",
    valorBruto: 10,
    valorDescontado: 10,
    valorLiquido: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function richLocal(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "BIC", status: "ativo", createdAt: "" }],
    users: [],
    notasPedido: [mkNota()],
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [pag("confirmado", "2026-09-01T10:00:00.000Z")],
    descontos: [desconto("d1"), desconto("d2")],
    mensalidades: [],
    arquivosMensais: [],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "I", createdAt: "" }],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

function cloudPartial(): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    fichaCorrida: [mkFicha()],
    pagamentosCooperado: [pag("aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
}

clearCloudResetAppliedVersionForTests(CNPJ);
setCloudResetAppliedVersionForTests(CNPJ, VER);
resetCreditosBaseMapCache();

// T1 — BIC compute não muta AppData de entrada (referência pagamentos/descontos)
{
  const input = richLocal();
  const pagRef = input.pagamentosCooperado;
  const descRef = input.descontos;
  resetCreditosBaseMapCache();
  buildCreditosBaseMap(input, [COOPERADO], COOP);
  prepararAppDataParaCreditoBaseHb(input);
  hbCreditCreditoBaseReais(input, COOPERADO, COOP);
  assert.strictEqual(input.pagamentosCooperado, pagRef);
  assert.strictEqual(input.descontos, descRef);
  assert.equal(input.pagamentosCooperado[0]?.status, "confirmado");
}

// T2 — pipeline reconciliado + cloud parcial: descontos preservados no AppData usado pelo BIC
{
  const { data: reconciled } = syncOperacionalPullPipelineForTests(richLocal(), cloudPartial(), COOP, CNPJ);
  assert.equal(reconciled.descontos.filter((d) => d.cooperadoId === COOPERADO).length, 2);
  resetCreditosBaseMapCache();
  buildCreditosBaseMap(reconciled, [COOPERADO], COOP);
}

// T3 — buildMinimal: domínio ausente no raw cloud não vira [] artificial no merge interno
{
  const raw = cloudPartial();
  delete (raw as { descontos?: Desconto[] }).descontos;
  assert.ok(!operacionalDominioFornecidoNoPayload(raw, "descontos"));
  const minimal = buildMinimalAppDataForCreditBase({
    operacional: raw,
    cooperativaId: COOP,
    cnpj: CNPJ,
    cooperados: richLocal().cooperados,
    notasPedido: [mkNota()],
  });
  assert.equal(minimal.descontos.length, 0);
}

// T4 — BIC não rebaixa pagamento (merge semântico independente; entrada intacta)
{
  const input = richLocal();
  const merged = mergePagamentoCooperadoRecord(
    input.pagamentosCooperado[0]!,
    pag("aguardando_confirmacao", "2026-09-20T13:00:00.000Z")
  );
  assert.equal(merged.status, "confirmado");
  hbCreditCreditoBaseReais(input, COOPERADO, COOP);
  assert.equal(input.pagamentosCooperado[0]?.status, "confirmado");
}

// T5 — HB SQL autoridade (mesma regra SYNC S2)
{
  const merged = mergeContaCoopDescontosFieldSync(
    [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "hb_tx",
      },
    ],
    [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-06T00:00:00.000Z",
      },
    ]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].hbTransactionId, "hb_tx");
}

// T6 — linha operacional stale sem hbTransactionId não cria incidência nova
{
  const merged = mergeContaCoopDescontosFieldSync(
    [],
    [
      {
        motivo: "Compra HB",
        valorReais: 99,
        tipo: "conta_coop",
        createdAt: "2026-09-06T00:00:00.000Z",
      },
    ]
  );
  assert.equal(merged.length, 0);
}

// T7/T8 — módulos BIC/HB credit base: sem clear operacional (sanity por ausência de side-effect no input)
{
  const before = richLocal();
  const cloneLen = before.descontos.length;
  buildCreditosBaseAuthoritativeFromCloud(
    cloudPartial(),
    COOP,
    CNPJ,
    [COOPERADO],
    before.cooperados,
    before.notasPedido
  );
  assert.equal(before.descontos.length, cloneLen);
}

// T9 — mesma AppData reconciliada final → mesma base BIC (ordem de chegada irrelevante se estado igual)
{
  const stateA = syncOperacionalPullPipelineForTests(richLocal(), cloudPartial(), COOP, CNPJ).data;
  const stateB = syncOperacionalPullPipelineForTests(richLocal(), cloudPartial(), COOP, CNPJ).data;
  resetCreditosBaseMapCache();
  const mapA = buildCreditosBaseMap(stateA, [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const mapB = buildCreditosBaseMap(stateB, [COOPERADO], COOP);
  assert.deepEqual(mapA, mapB);
}

// T10 — idempotência BIC sobre mesmo AppData
{
  const data = syncOperacionalPullPipelineForTests(richLocal(), cloudPartial(), COOP, CNPJ).data;
  resetCreditosBaseMapCache();
  const m1 = buildCreditosBaseMap(data, [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const m2 = buildCreditosBaseMap(data, [COOPERADO], COOP);
  assert.deepEqual(m1, m2);
  const v1 = hbCreditValorAReceberAgregado(data, COOPERADO, COOP);
  const v2 = hbCreditValorAReceberAgregado(data, COOPERADO, COOP);
  assert.deepEqual(v1, v2);
}

// T11 — uma projeção M6 (BIC central == hbCredit leitura)
{
  const data = richLocal();
  const a = bicCentralValorAReceberAgregado(data, COOPERADO, COOP, { apresentacaoConsolidada: true });
  const b = hbCreditValorAReceberAgregado(data, COOPERADO, COOP);
  assert.deepEqual(a, b);
}

// T12 — hbCreditLeituraBic documentado read-only: não altera comprimento de coleções
{
  const data = richLocal();
  const n = data.notasPedido.length;
  const p = data.pagamentosCooperado.length;
  hbCreditCreditoBaseReais(data, COOPERADO, COOP);
  bicCentralValorAReceberAgregado(data, COOPERADO, COOP);
  assert.equal(data.notasPedido.length, n);
  assert.equal(data.pagamentosCooperado.length, p);
}

console.log("OK — test-bic-sync-contract");
