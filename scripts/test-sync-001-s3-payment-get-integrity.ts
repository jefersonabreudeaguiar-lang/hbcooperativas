/**
 * SYNC-001/S3 — GET/pull × monotonicidade pagamento confirmado (in-memory).
 * npx tsx scripts/test-sync-001-s3-payment-get-integrity.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, PagamentoCooperadoRegistro } from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  aplicarOperacionalPullLocalForTests,
  mergeOperacionalIntoData,
} from "../src/services/cooperativaSyncCloudService.ts";
import { clearOperacionalFinanceiroForCooperativa } from "../src/services/operationalReset.ts";
import {
  getPagamentoAguardandoCooperado,
  getTotalAPagarCooperado,
} from "../src/services/notaPedidoService.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService.ts";
import { prepararOperacionalSyncPayloadPagamentosPull } from "../src/services/pagamentoRegistroMerge.ts";

const COOP = "coop-s3";
const COOPERADO = "c_s3";
const MES = "2026-09";

function pagamento(
  id: string,
  status: PagamentoCooperadoRegistro["status"],
  extra?: Partial<PagamentoCooperadoRegistro>
): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    mesesReferencia: [MES],
    valorBruto: 1000,
    descontoCooperativa: 0,
    descontosExtras: [],
    valorLiquido: 1000,
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
    status,
    pagoPor: "Resp",
    pagoEm: "2026-09-20T12:00:00.000Z",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-21T12:00:00.000Z",
    ...extra,
  };
}

function ficha(status: FichaCorrida["status"] = "pago"): FichaCorrida {
  return {
    id: "f1",
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: "n1",
    mesReferencia: MES,
    status,
    valorBruto: 1000,
    descontos: 0,
    valorLiquido: 1000,
    descricao: "Entrega",
    createdAt: "2026-09-01T00:00:00.000Z",
  } as FichaCorrida;
}

function appData(pagamentos: PagamentoCooperadoRegistro[]): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "S3",
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
        status: "pago",
        valorBruto: 1000,
        valorLiquido: 1000,
        instituicaoId: "i1",
        itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 1000 }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    fichaCorrida: [ficha("pago")],
    pagamentosCooperado: pagamentos,
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    cotas: [],
    pagamentos: [],
    config: {},
  } as AppData;
}

function cloudPayload(
  pagamentos: PagamentoCooperadoRegistro[],
  extra?: Partial<OperacionalSyncPayload>
): OperacionalSyncPayload {
  return {
    updatedAt: "2026-09-22T18:00:00.000Z",
    operationalResetVersion: 15,
    fichaCorrida: [ficha("pago")],
    pagamentosCooperado: pagamentos,
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: {},
    ...extra,
  };
}

function assertConfirmadoMonotono(data: AppData, label: string) {
  const pg = data.pagamentosCooperado.find((p) => p.id === "pg_ok");
  assert.equal(pg?.status, "confirmado", `${label}: status`);
  assert.equal(pg?.valorLiquido, 1000, `${label}: valor`);
  assert.equal(getPagamentoAguardandoCooperado(data, COOPERADO, MES), undefined, `${label}: sem aguardando`);
  assert.equal(getTotalAPagarCooperado(data, COOPERADO, undefined, COOP), 0, `${label}: A receber 0`);
  const card = getValorQuantoVouReceber(data, COOPERADO, COOP);
  assert.equal(card.aguardandoAssinatura, false, `${label}: assinatura`);
  assert.equal(card.valorRecibo, 0, `${label}: valorRecibo`);
}

function pull(data: AppData, cloud: OperacionalSyncPayload) {
  let next = aplicarOperacionalPullLocalForTests(data, cloud, COOP, "62351750000165").data;
  next = posProcessarIntegridadePagamentosCooperativa(next);
  return next;
}

const confirmadoLocal = pagamento("pg_ok", "confirmado", {
  assinaturaCooperado: "sig",
  assinadoEm: "2026-09-21T14:00:00.000Z",
});

// 1) confirmado local × aguardando cloud (GET-shaped)
{
  const after = pull(appData([confirmadoLocal]), cloudPayload([
    pagamento("pg_ok", "aguardando_confirmacao", { updatedAt: "2026-09-23T20:00:00.000Z" }),
  ]));
  assertConfirmadoMonotono(after, "c1");
}

// 2) confirmado local × [] cloud
{
  const after = pull(appData([confirmadoLocal]), cloudPayload([]));
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "pg_ok" && p.status === "confirmado"));
}

// 3) stale cloud updatedAt mais novo
{
  const after = pull(
    appData([confirmadoLocal]),
    cloudPayload([pagamento("pg_ok", "aguardando_confirmacao")], {
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
  );
  assertConfirmadoMonotono(after, "c3");
}

// 4) recibo assinado preservado
{
  const after = pull(appData([confirmadoLocal]), cloudPayload([
    pagamento("pg_ok", "aguardando_confirmacao", { assinaturaCooperado: undefined }),
  ]));
  const pg = after.pagamentosCooperado.find((p) => p.id === "pg_ok");
  assert.equal(pg?.assinaturaCooperado, "sig");
  assertConfirmadoMonotono(after, "c4");
}

// 5) ausente no snapshot parcial — outro pagamento na nuvem
{
  const after = pull(appData([confirmadoLocal]), cloudPayload([
    pagamento("pg_outro", "aguardando_confirmacao"),
  ]));
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "pg_ok" && p.status === "confirmado"));
}

// 6) confirmado cloud × aguardando local
{
  const local = pagamento("pg_ok", "aguardando_confirmacao");
  const after = pull(appData([local]), cloudPayload([confirmadoLocal]));
  assert.equal(after.pagamentosCooperado.find((p) => p.id === "pg_ok")?.status, "confirmado");
}

// 7) fullReset completo (S1) — substituição só com marcador; cloud autoritativa confirmada
{
  const cloudFull = cloudPayload([confirmadoLocal], {
    fullReset: true,
    operacionalSnapshotComplete: true,
    operationalResetVersion: 20,
  });
  const after = pull(appData([pagamento("pg_old", "confirmado")]), cloudFull);
  assert.ok(after.pagamentosCooperado.some((p) => p.id === "pg_ok"));
}

// 8–9) idempotência / ordem invertida preparar payload
{
  const local = [confirmadoLocal];
  const stale = cloudPayload([pagamento("pg_ok", "aguardando_confirmacao")]);
  const a = prepararOperacionalSyncPayloadPagamentosPull(local, stale, COOP);
  const b = prepararOperacionalSyncPayloadPagamentosPull(local, a, COOP);
  assert.equal(b.pagamentosCooperado.find((p) => p.id === "pg_ok")?.status, "confirmado");
}

// clear financeiro + baseline (simula pull com clear autorizado vs baseline S3)
{
  const baseline = [confirmadoLocal];
  let cleared = clearOperacionalFinanceiroForCooperativa(appData(baseline), COOP);
  assert.equal(cleared.pagamentosCooperado.length, 0);
  const prep = prepararOperacionalSyncPayloadPagamentosPull(
    baseline,
    cloudPayload([pagamento("pg_ok", "aguardando_confirmacao")]),
    COOP
  );
  const merged = mergeOperacionalIntoData(cleared, prep, COOP, [], undefined, {
    localPagamentosCoopBaseline: baseline,
  });
  assertConfirmadoMonotono(posProcessarIntegridadePagamentosCooperativa(merged), "baseline+pós-clear");
}

console.log("OK — test-sync-001-s3-payment-get-integrity");
