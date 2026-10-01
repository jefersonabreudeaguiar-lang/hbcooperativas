/**
 * H8.14E — blindagem fullReset operacional (in-memory).
 * npx tsx scripts/test-h814e-operacional-reset-safe.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  aplicarOperacionalPullLocalForTests,
  avaliarFullResetOperacionalPullSeguro,
  buildOperacionalPayloadForTests,
  operacionalColecoesReplaceAutoritativo,
} from "../src/services/cooperativaSyncCloudService.ts";
import { clearOperacionalFinanceiroForCooperativa } from "../src/services/operationalReset.ts";
import { getTotalAPagarCooperado } from "../src/services/notaPedidoService.ts";
import {
  clearOperacionalPullMergedWatermarkForTests,
  noteOperacionalPullMergedUpdatedAt,
  setOperacionalCloudAuthoritativeForTests,
} from "../src/services/operationalReset.ts";

const CNPJ = "62351750000165";
const COOP = "coop-h814e";

function shell(
  notas: NotaPedido[],
  fichaCorrida: FichaCorrida[] = [],
  extra?: Partial<AppData>
): AppData {
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
    fichaCorrida,
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", cooperativaId: COOP, nome: "Escola", createdAt: "", updatedAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    notasPedidoExcluidas: [],
    cotas: [],
    pagamentos: [],
    financeiro: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    config: {},
    contaCoopDescontos: [{ id: "ccd-1", cooperadoId: "c1", valor: 50, descricao: "HB mem", mesReferencia: "2026-08" }],
    contaCoopDescontosUpdatedAt: "2026-08-01T00:00:00.000Z",
    ...extra,
  } as AppData;
}

function mkNota(id: string, status: NotaPedido["status"]): NotaPedido {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: "c1",
    cooperadoNomeSnapshot: "Coop 1",
    instituicaoId: "inst-1",
    numeroNota: id,
    dataEntrega: "2026-08-01",
    mesReferencia: "2026-08",
    itens: [
      {
        produtoInstituicaoId: "p1",
        produtoNome: "P",
        unidade: "un",
        quantidade: 1,
        precoUnitario: 10,
        valorBruto: 10,
      },
    ],
    valorBruto: 10,
    valorDesconto: 0,
    valorLiquido: 10,
    percentualDescontoCooperativa: 0,
    fotosEnviadasCount: 1,
    fotoNaNuvem: true,
    status,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  };
}

function mkFicha(id: string, notaId: string, valor = 10): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: "c1",
    cooperadoNomeSnapshot: "Coop 1",
    notaPedidoId: notaId,
    descricao: notaId,
    valorBruto: valor,
    descontos: 0,
    valorLiquido: valor,
    saldoAcumulado: valor,
    mesReferencia: "2026-08",
    status: "pendente",
    dataLancamento: "2026-08-01",
    dataPagamentoPrevista: "2026-08-30",
    responsavelConferencia: "Resp",
    itens: [],
    percentualDescontoCooperativa: 0,
    descontosDetalhe: [],
    createdAt: "2026-08-01T10:00:00.000Z",
  };
}

function mkCloud(
  fichas: FichaCorrida[],
  opts?: Partial<OperacionalSyncPayload>
): OperacionalSyncPayload {
  return {
    updatedAt: opts?.updatedAt ?? "2026-09-01T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: 15,
    fichaCorrida: fichas,
    pagamentosCooperado: opts?.pagamentosCooperado ?? [],
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    notasPedidoExcluidas: [],
    ...opts,
  } as OperacionalSyncPayload;
}

function fichaNotaIds(data: AppData): string[] {
  return data.fichaCorrida.map((f) => f.notaPedidoId ?? "").filter(Boolean).sort();
}

function assertFinanceiroPreservado(before: AppData, after: AppData): void {
  assert.deepEqual(after.contaCoopDescontos, before.contaCoopDescontos);
  assert.equal(after.contaCoopDescontosUpdatedAt, before.contaCoopDescontosUpdatedAt);
  assert.deepEqual(
    after.notasPedido.map((n) => n.id).sort(),
    before.notasPedido.map((n) => n.id).sort()
  );
}

function run(): void {
  clearOperacionalPullMergedWatermarkForTests(CNPJ);
  setOperacionalCloudAuthoritativeForTests(null);

  const notas123 = [mkNota("N1", "conferida"), mkNota("N2", "conferida"), mkNota("N3", "conferida")];
  const f123 = [mkFicha("F1", "N1"), mkFicha("F2", "N2"), mkFicha("F3", "N3")];

  // T1 — payload completo alinhado (F1,F2,F3)
  {
    const before = shell(notas123, f123);
    const cloud = mkCloud([mkFicha("F1c", "N1"), mkFicha("F2c", "N2"), mkFicha("F3c", "N3")]);
    const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
    assert.ok(seguro.permitirClearFinanceiro);
    assert.ok(seguro.permitirCloudAuthoritative);
    const { data: after, pullSeguro } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.ok(pullSeguro.permitirMergeAutoritativo);
    assert.deepEqual(fichaNotaIds(after), ["N1", "N2", "N3"]);
    assertFinanceiroPreservado(before, after);
  }

  // T2 — vazio + fullReset + conferidas locais → sem clear
  {
    const before = shell(notas123, f123);
    const cloud = mkCloud([]);
    const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
    assert.equal(seguro.permitirClearFinanceiro, false);
    const countBefore = before.fichaCorrida.length;
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.equal(after.fichaCorrida.length, countBefore);
    assert.ok(after.fichaCorrida.some((f) => f.notaPedidoId === "N3"));
    assert.equal(
      clearOperacionalFinanceiroForCooperativa(before, COOP).fichaCorrida.length,
      0,
      "clear isolado apagaria — guard deve impedir no pull"
    );
    assertFinanceiroPreservado(before, after);
  }

  // T3 — parcial F1,F2 + fullReset → F3 preservada
  {
    const before = shell(notas123, f123);
    const cloud = mkCloud([mkFicha("F1c", "N1"), mkFicha("F2c", "N2")]);
    const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
    assert.equal(seguro.permitirClearFinanceiro, false);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.deepEqual(fichaNotaIds(after), ["N1", "N2", "N3"]);
    assertFinanceiroPreservado(before, after);
  }

  // T4 — resposta antiga após merge novo
  {
    clearOperacionalPullMergedWatermarkForTests(CNPJ);
    const before = shell(notas123, f123);
    const cloudNew = mkCloud(f123, { updatedAt: "2026-09-02T12:00:00.000Z" });
    noteOperacionalPullMergedUpdatedAt(CNPJ, cloudNew.updatedAt);
    const cloudOld = mkCloud([], { updatedAt: "2026-09-01T10:00:00.000Z" });
    const seguro = avaliarFullResetOperacionalPullSeguro(before, cloudOld, COOP, CNPJ);
    assert.equal(seguro.permitirClearFinanceiro, false);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloudOld, COOP, CNPJ);
    assert.ok(after.fichaCorrida.some((f) => f.notaPedidoId === "N3"));
  }

  // T5 / T6 — N1–N3 local, cloud notas implícito via fichas parciais/vazias
  {
    const before = shell(notas123, f123);
    const cloud = mkCloud([]);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.ok(after.notasPedido.some((n) => n.id === "N3"));
    assert.ok(after.fichaCorrida.some((f) => f.notaPedidoId === "N3"));
  }

  // T7 — pagamento confirmado preservado
  {
    const pag: PagamentoCooperadoRegistro = {
      id: "pag-1",
      cooperativaId: COOP,
      cooperadoId: "c1",
      mesReferencia: "2026-08",
      valorTotal: 10,
      status: "confirmado",
      pagoEm: "2026-08-15T10:00:00.000Z",
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    };
    const before = shell(notas123, f123, { pagamentosCooperado: [pag] });
    const cloud = mkCloud([]);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.ok(after.pagamentosCooperado.some((p) => p.id === "pag-1" && p.status === "confirmado"));
  }

  // T8 — HB / conta coop memória preservada
  {
    const before = shell(notas123, f123);
    const cloud = mkCloud([mkFicha("F1c", "N1")]);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.equal(after.contaCoopDescontos?.[0]?.id, "ccd-1");
    assert.equal(after.contaCoopDescontos?.[0]?.valor, 50);
  }

  // T9 — alias T8 conta coop (redundante explícito)
  {
    const before = shell(notas123, f123);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, mkCloud([]), COOP, CNPJ);
    assert.deepEqual(after.contaCoopDescontos, before.contaCoopDescontos);
  }

  // T10 — A Receber não zera por payload ambíguo
  {
    const before = shell(notas123, f123);
    const totalBefore = getTotalAPagarCooperado(before, "c1", "2026-08", COOP);
    assert.ok(totalBefore > 0);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, mkCloud([]), COOP, CNPJ);
    const totalAfter = getTotalAPagarCooperado(after, "c1", "2026-08", COOP);
    assert.ok(totalAfter > 0, "A Receber não deve cair a zero por operacional vazio ambíguo");
  }

  // T11 — fullReset sem prova não autoriza authoritative
  {
    const before = shell(notas123, f123);
    const seguro = avaliarFullResetOperacionalPullSeguro(before, mkCloud([]), COOP, CNPJ);
    assert.equal(seguro.permitirCloudAuthoritative, false);
    assert.equal(seguro.permitirMergeAutoritativo, false);
  }

  // T12 — reset legítimo completo mantém substituição autoritativa
  {
    clearOperacionalPullMergedWatermarkForTests(CNPJ);
    const before = shell(notas123, f123);
    const cloud = mkCloud(
      [mkFicha("F1n", "N1", 11), mkFicha("F2n", "N2", 12), mkFicha("F3n", "N3", 13)],
      { updatedAt: "2026-09-03T12:00:00.000Z", operacionalSnapshotComplete: true }
    );
    const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
    assert.ok(seguro.permitirClearFinanceiro);
    const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
    assert.equal(after.fichaCorrida.find((f) => f.notaPedidoId === "N3")?.valorLiquido, 13);
  }

  console.log("test-h814e-operacional-reset-safe — OK (T1–T12)");
}

run();
