/**
 * SYNC-001/S1 — fullReset autoritativo não apaga coleções sem operacionalSnapshotComplete.
 * npx tsx scripts/test-sync-001-s1-fullreset.ts
 */
import assert from "node:assert/strict";
import type { AppData, Desconto, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  aplicarOperacionalPullLocalForTests,
  avaliarFullResetOperacionalPullSeguro,
  buildOperacionalPayloadForTests,
  mergeOperacionalIntoData,
  operacionalColecoesReplaceAutoritativo,
} from "../src/services/cooperativaSyncCloudService.ts";
import {
  clearOperacionalPullMergedWatermarkForTests,
  noteOperacionalPullMergedUpdatedAt,
  setOperacionalCloudAuthoritativeForTests,
} from "../src/services/operationalReset.ts";
import { getTotalAPagarCooperado } from "../src/services/notaPedidoService.ts";

const CNPJ = "62351750000165";
const COOP = "coop-s1";

function mkNota(id: string, cooperadoId: string): NotaPedido {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId,
    instituicaoId: "inst-1",
    numeroNota: id,
    mesReferencia: "2026-09",
    status: "conferida",
    valorBruto: 100,
    valorLiquido: 100,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 100, valorBruto: 100 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  } as NotaPedido;
}

function mkFicha(id: string, notaId: string, cooperadoId: string): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId,
    notaPedidoId: notaId,
    descricao: notaId,
    mesReferencia: "2026-09",
    status: "pendente",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    saldoAcumulado: 0,
    dataLancamento: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
  } as FichaCorrida;
}

function localRich(): AppData {
  const cooperados = [
    { id: "c1", cooperativaId: COOP, nomeCompleto: "A", status: "ativo", createdAt: "" },
    { id: "c2", cooperativaId: COOP, nomeCompleto: "B", status: "ativo", createdAt: "" },
    { id: "c3", cooperativaId: COOP, nomeCompleto: "C", status: "ativo", createdAt: "" },
  ];
  const notas = [mkNota("n1", "c1"), mkNota("n2", "c2"), mkNota("n3", "c3")];
  const fichas = [
    mkFicha("f1", "n1", "c1"),
    mkFicha("f2", "n2", "c2"),
    mkFicha("f3", "n3", "c3"),
  ];
  const pagamentos: PagamentoCooperadoRegistro[] = [
    {
      id: "pg_ok",
      cooperativaId: COOP,
      cooperadoId: "c1",
      mesReferencia: "2026-09",
      status: "confirmado",
      valorBruto: 100,
      valorLiquido: 100,
      descontoCooperativa: 0,
      descontosExtras: [],
      fichaIds: ["f1"],
      notaPedidoIds: ["n1"],
      pagoEm: "2026-09-10T10:00:00.000Z",
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:00:00.000Z",
    },
  ];
  const descontos: Desconto[] = [
    {
      id: "d1",
      cooperadoId: "c1",
      tipo: "manual",
      motivo: "Manual",
      data: "2026-09-05",
      responsavel: "admin",
      valorBruto: 15,
      valorDescontado: 15,
      valorLiquido: 0,
      createdAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "d2",
      cooperadoId: "c2",
      tipo: "manual",
      motivo: "Manual",
      data: "2026-09-05",
      responsavel: "admin",
      valorBruto: 20,
      valorDescontado: 20,
      valorLiquido: 0,
      createdAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "d3",
      cooperadoId: "c3",
      tipo: "manual",
      motivo: "Manual",
      data: "2026-09-05",
      responsavel: "admin",
      valorBruto: 25,
      valorDescontado: 25,
      valorLiquido: 0,
      createdAt: "2026-09-01T10:00:00.000Z",
    },
  ];
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados,
    users: [],
    notasPedido: notas,
    fichaCorrida: fichas,
    pagamentosCooperado: pagamentos,
    descontos,
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", cooperativaId: COOP, nome: "I", createdAt: "" }],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    financeiro: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

function cloudPartialAligned(local: AppData, opts?: Partial<OperacionalSyncPayload>): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-15T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: 15,
    fichaCorrida: [
      mkFicha("f1c", "n1", "c1"),
      mkFicha("f2c", "n2", "c2"),
      mkFicha("f3c", "n3", "c3"),
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
    ...opts,
  };
}

clearOperacionalPullMergedWatermarkForTests(CNPJ);
setOperacionalCloudAuthoritativeForTests(null);

// Reprodução S1: fullReset alinhado SEM snapshot complete → descontos locais preservados
{
  const before = localRich();
  const cloud = cloudPartialAligned(before);
  const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
  assert.ok(seguro.permitirMergeAutoritativo, "ficha alinhada autoriza merge ficha");
  assert.equal(
    operacionalColecoesReplaceAutoritativo(true, cloud, seguro),
    false,
    "coleções não replace sem marcador"
  );
  const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
  assert.equal(after.descontos.length, 3, "descontos locais não apagados por [] cloud");
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "pg_ok"));
  assert.ok(after.notasPedido.some((n) => n.id === "n3"));
  assert.ok(after.fichaCorrida.some((f) => f.notaPedidoId === "n3"));
}

// Snapshot complete + payload built from local → replace permitido
{
  const before = localRich();
  const built = buildOperacionalPayloadForTests(before, COOP);
  assert.equal(built.operacionalSnapshotComplete, true);
  const seguro = avaliarFullResetOperacionalPullSeguro(before, { ...built, fullReset: true }, COOP, CNPJ);
  assert.ok(operacionalColecoesReplaceAutoritativo(seguro.permitirMergeAutoritativo, built, seguro));
  const { data: after } = aplicarOperacionalPullLocalForTests(
    before,
    { ...built, fullReset: true },
    COOP,
    CNPJ
  );
  assert.equal(after.descontos.length, built.descontos.length);
}

// Forçar cloudAuthoritative bypass pullSeguro (teste de regressão interna) — coleções ainda protegidas
{
  const before = localRich();
  const cloud = cloudPartialAligned(before);
  const pullBypass = {
    permitirClearFinanceiro: false,
    permitirCloudAuthoritative: true,
    permitirMergeAutoritativo: true,
    permitirAplicarResetLegado: false,
    motivo: "test bypass",
  };
  const merged = mergeOperacionalIntoData(before, cloud, COOP, [], pullBypass);
  assert.equal(merged.descontos.length, 3);
}

// Pagamento confirmado + cloud vazio ambíguo (h814e) preservado
{
  const before = localRich();
  const cloud = cloudPartialAligned(before, { fichaCorrida: [] });
  const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
  assert.ok(after.pagamentosCooperado.some((p) => p.status === "confirmado"));
}

// A receber não zera com payload ambíguo
{
  const before = localRich();
  const totalBefore = getTotalAPagarCooperado(before, "c2", "2026-09", COOP);
  assert.ok(totalBefore > 0);
  const { data: after } = aplicarOperacionalPullLocalForTests(
    before,
    cloudPartialAligned(before, { fichaCorrida: [] }),
    COOP,
    CNPJ
  );
  assert.ok(getTotalAPagarCooperado(after, "c2", "2026-09", COOP) > 0);
}

// Coleção ausente no payload ≠ vazia — descontos locais preservados
{
  const before = localRich();
  const cloud = cloudPartialAligned(before);
  delete (cloud as { descontos?: Desconto[] }).descontos;
  const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
  assert.equal(after.descontos.length, 3);
}

// Coleção vazia com marcador de snapshot completo → replace autorizado (zera descontos)
{
  const before = localRich();
  const cloud = cloudPartialAligned(before, {
    operacionalSnapshotComplete: true,
    descontos: [],
  });
  assert.ok(operacionalColecoesReplaceAutoritativo(true, cloud, avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ)));
  const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
  assert.equal(after.descontos.length, 0);
}

// Snapshot stale (updatedAt anterior ao watermark) → pull negado
{
  const before = localRich();
  noteOperacionalPullMergedUpdatedAt(CNPJ, "2026-10-01T00:00:00.000Z");
  const cloud = cloudPartialAligned(before, { updatedAt: "2026-09-01T00:00:00.000Z" });
  const seguro = avaliarFullResetOperacionalPullSeguro(before, cloud, COOP, CNPJ);
  assert.equal(seguro.permitirMergeAutoritativo, false);
  assert.match(seguro.motivo, /mais antigo/);
  clearOperacionalPullMergedWatermarkForTests(CNPJ);
}

// Notas conferidas + snapshot incompleto → notas preservadas
{
  const before = localRich();
  const cloud = cloudPartialAligned(before, { fichaCorrida: [] });
  const { data: after } = aplicarOperacionalPullLocalForTests(before, cloud, COOP, CNPJ);
  assert.equal(after.notasPedido.filter((n) => n.cooperativaId === COOP).length, 3);
}

// Três domínios simultâneos (desconto + pagamento + ficha) sem perda com payload parcial
{
  const before = localRich();
  const { data: after } = aplicarOperacionalPullLocalForTests(
    before,
    cloudPartialAligned(before),
    COOP,
    CNPJ
  );
  assert.equal(after.descontos.length, 3);
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "pg_ok"));
  assert.equal(after.fichaCorrida.filter((f) => f.cooperativaId === COOP).length, 3);
}

console.log("OK — test-sync-001-s1-fullreset");
