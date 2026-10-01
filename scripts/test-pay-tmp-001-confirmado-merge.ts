/**
 * PAY-TMP-001 — pagamento confirmado não ressuscita após merge/sync (in-memory).
 * npx tsx scripts/test-pay-tmp-001-confirmado-merge.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, PagamentoCooperadoRegistro } from "@/types";
import {
  mergeOperacionalIntoData,
  mergePagamentosCooperadoFromCloud,
} from "../src/services/cooperativaSyncCloudService.ts";
import {
  confirmarPagamentoCooperado,
  getPagamentoAguardandoCooperado,
  getTotalAPagarCooperado,
  registrarPagamentoCooperado,
} from "../src/services/notaPedidoService.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";

const COOP = "coop-pay-tmp";
const COOPERADO = "c_coop_1";
const MES = "2026-09";

function fichaBase(id: string, status: FichaCorrida["status"] = "pago"): FichaCorrida {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: "n1",
    mesReferencia: MES,
    status,
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    saldoAcumulado: 0,
    descricao: "Entrega nota n1",
    dataLancamento: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  };
}

function pagamentoBase(
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
    valorBruto: 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    valorLiquido: 100,
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

function appBase(pagamentos: PagamentoCooperadoRegistro[]): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado Teste",
        cpfCnpj: "12345678901",
        telefone: "",
        endereco: "",
        comunidade: "",
        cafDap: "",
        chavePix: "",
        banco: "",
        agencia: "",
        conta: "",
        status: "ativo",
        produtos: [],
        observacoes: "",
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [
      {
        id: "n1",
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        mesReferencia: MES,
        numeroNota: "1",
        instituicaoId: "i1",
        status: "pago",
        itens: [{ produtoId: "p1", quantidade: 1, valorUnitario: 100, valorTotal: 100 }],
        valorBruto: 100,
        valorDesconto: 0,
        valorLiquido: 100,
        createdAt: "",
        updatedAt: "",
      } as AppData["notasPedido"][0],
    ],
    fichaCorrida: [fichaBase("f1", "pago")],
    pagamentosCooperado: pagamentos,
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

function operacionalFrom(
  pagamentos: PagamentoCooperadoRegistro[],
  fichas: FichaCorrida[] = [fichaBase("f1", "pago")]
): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: 15,
    pagamentosCooperado: pagamentos,
    fichaCorrida: fichas,
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

function assertConfirmadoEstavel(data: AppData, label: string) {
  assert.equal(getPagamentoAguardandoCooperado(data, COOPERADO, MES), undefined, `${label}: sem aguardando`);
  assert.equal(getTotalAPagarCooperado(data, COOPERADO, undefined, COOP), 0, `${label}: A receber 0`);
  const card = getValorQuantoVouReceber(data, COOPERADO, COOP);
  assert.equal(card.aguardandoAssinatura, false, `${label}: sem assinar recibo`);
  assert.equal(card.valorRecibo, 0, `${label}: valorRecibo 0`);
}

// 1) merge: local confirmado + cloud aguardando (mesmo id, cloud mais novo)
{
  const local = [pagamentoBase("pg1", "confirmado", { assinadoEm: "2026-09-21T14:00:00.000Z", assinaturaCooperado: "sig" })];
  const cloud = [
    pagamentoBase("pg1", "aguardando_confirmacao", { updatedAt: "2026-09-22T18:00:00.000Z" }),
  ];
  const merged = mergePagamentosCooperadoFromCloud(local, cloud);
  assert.equal(merged.find((p) => p.id === "pg1")?.status, "confirmado");
}

// 2) merge: cloud confirmado + local aguardando
{
  const local = [pagamentoBase("pg1", "aguardando_confirmacao")];
  const cloud = [
    pagamentoBase("pg1", "confirmado", { assinadoEm: "2026-09-21T14:00:00.000Z", assinaturaCooperado: "sig" }),
  ];
  const merged = mergePagamentosCooperadoFromCloud(local, cloud);
  assert.equal(merged.find((p) => p.id === "pg1")?.status, "confirmado");
}

// 3) fluxo temporal: confirmado → merge operacional com snapshot aguardando → posProcessar
{
  let data = appBase([
    pagamentoBase("pg1", "confirmado", { assinadoEm: "2026-09-21T14:00:00.000Z", assinaturaCooperado: "sig" }),
  ]);
  assertConfirmadoEstavel(data, "antes sync");
  const cloudStale = operacionalFrom([
    pagamentoBase("pg1", "aguardando_confirmacao", { updatedAt: "2026-09-22T20:00:00.000Z" }),
  ]);
  data = mergeOperacionalIntoData(data, cloudStale, COOP, []);
  data = posProcessarIntegridadePagamentosCooperativa(data);
  assertConfirmadoEstavel(data, "após sync stale");
}

// 4) stale duplicado (Orlando-shaped) + confirmado
{
  const data = appBase([
    pagamentoBase("pg_stale", "aguardando_confirmacao"),
    pagamentoBase("pg_ok", "confirmado", {
      assinadoEm: "2026-09-21T14:00:00.000Z",
      assinaturaCooperado: "sig",
    }),
  ]);
  assertConfirmadoEstavel(data, "stale+confirmado");
}

// 5) pendente → registrar → confirmar → re-merge cloud aguardando
{
  let data = appBase([]);
  data = {
    ...data,
    notasPedido: [{ ...data.notasPedido[0]!, status: "conferida" }],
    fichaCorrida: [fichaBase("f1", "pendente")],
  };
  data = registrarPagamentoCooperado(data, COOPERADO, MES, "Resp");
  const ag = getPagamentoAguardandoCooperado(data, COOPERADO, MES);
  assert.ok(ag, "pagamento aguardando após registrar");
  data = confirmarPagamentoCooperado(data, ag!.id, "data:image/png;base64,abc");
  assertConfirmadoEstavel(data, "pós-confirmação");
  const cloudStale = operacionalFrom([
    pagamentoBase(ag!.id, "aguardando_confirmacao", { updatedAt: "2026-09-23T10:00:00.000Z" }),
  ]);
  data = mergeOperacionalIntoData(data, cloudStale, COOP, []);
  data = posProcessarIntegridadePagamentosCooperativa(data);
  assertConfirmadoEstavel(data, "pós-confirmação + sync stale");
}

console.log("OK — test-pay-tmp-001-confirmado-merge");
