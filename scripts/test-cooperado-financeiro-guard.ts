/**
 * Cenários críticos do guard financeiro do cooperado (regressão Orlando).
 * Uso: npm run test:cooperado-financeiro
 */
import assert from "node:assert/strict";
import { cooperadoFinanceiroLocalAusente, notasSyncProvavelmenteCompleto } from "../src/services/fichaSyncGuard.ts";
import {
  buildValorExibicaoCooperadoOpts,
  getDescontosExtrasExibicaoCooperado,
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  getResumoPagamentoParaRegistro,
  getResumoValorAPagarRelatorio,
  getValorExibicaoCooperado,
  persistDescontosContaCoopNoArquivo,
  purgarFichasInvalidas,
  mergeArquivosMensaisFromCloud,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService.ts";
import { setContaCoopDescontosMemoria } from "../src/lib/hb-credit/contaCoopDescontosMemory.ts";
import {
  bumpContaCoopDescontosRevision,
  getContaCoopDescontosRevision,
  subscribeContaCoopDescontos,
} from "../src/lib/hb-credit/contaCoopDescontosNotify.ts";
import {
  getValorQuantoVouReceber,
  getConsolidadoFinanceiroCooperado,
  cooperadoPendentePagamentoResponsavel,
  listarMesesPendentesPagamentoResponsavel,
  listarMesesPendentesQuantoVouReceber,
} from "../src/services/cooperadoEntregasService.ts";
import {
  getCreditoBaseContaCoopReais,
  getCreditoBaseCooperadoCents,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { resolveMobileCooperadoId } from "../src/lib/hb-credit/mobileCooperadoLink.ts";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";

const COOP = "coop-1";
const COOPERADO = "c_orlando";

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Teste", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Orlando Teste",
        cpf: "00000000000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", nome: "Inst", cooperativaId: COOP, ativo: true, createdAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: {},
    ...overrides,
  } as AppData;
}

function ficha(id: string, notaId: string, mesReferencia = "2026-08"): FichaCorrida {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    notaPedidoId: notaId,
    mesReferencia,
    status: "pendente",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    descricao: `Entrega nota ${notaId}`,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function nota(id: string, status: NotaPedido["status"]): NotaPedido {
  return {
    id,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: "2026-08",
    status,
    valorLiquido: 100,
    valorBruto: 100,
    instituicaoId: "inst-1",
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 100 }],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

// HB Créditos — regressão: total abatido e linhas visíveis no resumo cooperado (executar antes dos demais)
{
  const MES = "2026-08";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — mercado teste",
      valorReais: 50,
      tipo: "conta_coop",
      createdAt: "2026-08-15T12:00:00.000Z",
    },
  ]);
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  const aReceber = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP);
  const opts = buildValorExibicaoCooperadoOpts(data, COOPERADO, MES, COOP);
  const linhas = getDescontosExtrasExibicaoCooperado(base, opts);
  const exibicao = getValorExibicaoCooperado(base, opts);

  assert.ok(aReceber.valorLiquido < base.valorEntregas, "compra HB deve reduzir valor a receber");
  assert.ok(
    linhas.some((d) => d.tipo === "conta_coop"),
    "resumo cooperado deve listar compra HB Créditos"
  );
  assert.equal(exibicao, aReceber.valorLiquido, "valor exibido deve igualar valor a receber");
}

{
  const MES = "2026-08";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
  });
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, [
    {
      motivo: "Compra HB Créditos — memoria sessao",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-08-20T12:00:00.000Z",
    },
  ]);
  const aReceber = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP);
  const exibicao = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.ok(aReceber.valorLiquido < 100, "cache HB deve abater valor a receber sem arquivo mensal");
  assert.ok(
    exibicao.descontosExtras.some((d) => d.tipo === "conta_coop"),
    "resumo exibicao deve listar HB via cache"
  );
}

{
  const before = getContaCoopDescontosRevision();
  let notified = 0;
  const unsub = subscribeContaCoopDescontos(() => {
    notified += 1;
  });
  setContaCoopDescontosMemoria(COOP, COOPERADO, "2026-08", [
    {
      motivo: "Estorno HB — teste notify",
      valorReais: -10,
      tipo: "conta_coop",
      createdAt: "2026-08-21T12:00:00.000Z",
    },
  ]);
  assert.ok(getContaCoopDescontosRevision() > before, "memória HB deve incrementar revision");
  assert.equal(notified, 1, "UI deve poder reagir via subscribe");
  bumpContaCoopDescontosRevision();
  assert.equal(notified, 2, "bump manual deve notificar assinantes");
  unsub();
}

{
  const MES = "2026-08";
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
    pagamentosCooperado: [
      {
        id: "pay_aguardando",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 100,
        fichaIds: ["f1"],
        notaPedidoIds: ["n1"],
        status: "aguardando_confirmacao",
        pagoPor: "Responsável teste",
        pagoEm: "2026-08-20T12:00:00.000Z",
        createdAt: "2026-08-20T12:00:00.000Z",
      },
    ],
  });
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, [
    {
      motivo: "Compra HB Créditos — após PIX aguardando",
      valorReais: 30,
      tipo: "conta_coop",
      createdAt: "2026-08-21T12:00:00.000Z",
    },
  ]);
  const inicio = getValorQuantoVouReceber(data, COOPERADO, COOP);
  assert.equal(inicio.valor, 70, "A receber deve abater HB mesmo aguardando assinatura do recibo");
  assert.equal(inicio.aguardandoAssinatura, true);
}

{
  const MES = "2026-08";
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
  });
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, [
    {
      motivo: "Compra HB Créditos",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-08-15T12:00:00.000Z",
    },
    {
      motivo: "Estorno HB Créditos — mercado",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-08-16T12:00:00.000Z",
    },
  ]);
  const inicio = getValorQuantoVouReceber(data, COOPERADO, COOP);
  assert.equal(inicio.valor, 100, "estorno HB deve restaurar valor a receber");
}

{
  const MES = "2026-08";
  const data = baseData({
    fichaCorrida: [{ ...ficha("f1", "n1", MES), status: "pago" }],
    notasPedido: [nota("n1", "pago")],
    pagamentosCooperado: [
      {
        id: "pg_confirmado",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [{ tipo: "mensalidade", motivo: "Mensalidade ago/2026", valor: 11.5 }],
        valorLiquido: 88.5,
        fichaIds: ["f1"],
        notaPedidoIds: ["n1"],
        status: "confirmado",
        pagoPor: "Responsável",
        pagoEm: "2026-08-25T12:00:00.000Z",
        assinadoEm: "2026-08-26T12:00:00.000Z",
        reciboHtml: "<p>recibo</p>",
        createdAt: "2026-08-25T12:00:00.000Z",
        updatedAt: "2026-08-26T12:00:00.000Z",
      },
    ],
  });
  const comHb = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — não pode alterar mês confirmado",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-08-27T12:00:00.000Z",
    },
  ]);
  const resumo = getResumoPagamentoExibicao(comHb, COOPERADO, MES, COOP);
  assert.equal(resumo.valorLiquido, 88.5, "mês confirmado mantém valor registrado no pagamento");
  assert.equal(
    comHb.arquivosMensais.find((a) => a.cooperadoId === COOPERADO && a.mesReferencia === MES)?.contaCoopDescontos
      ?.length ?? 0,
    0,
    "sync HB não sobrescreve arquivo de mês já confirmado"
  );
}

{
  const MES = "2026-09";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", MES)],
    notasPedido: [{ ...nota("n1", "conferida"), mesReferencia: MES }],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — nuvem fresca",
      valorReais: 50,
      tipo: "conta_coop",
      createdAt: "2026-09-10T10:00:00.000Z",
    },
  ]);
  const localArquivo = data.arquivosMensais.find(
    (a) => a.cooperadoId === COOPERADO && a.mesReferencia === MES
  )!;
  const cloudStale = {
    ...localArquivo,
    updatedAt: "2026-09-01T08:00:00.000Z",
    contaCoopDescontos: [
      {
        motivo: "Compra HB Créditos — lixo antigo sync",
        valorReais: 999,
        tipo: "conta_coop" as const,
        createdAt: "2026-09-02T10:00:00.000Z",
      },
    ],
  };
  const merged = mergeArquivosMensaisFromCloud(data, [localArquivo], [cloudStale]);
  const row = merged.find((a) => a.mesReferencia === MES);
  assert.ok(row?.contaCoopDescontos?.some((d) => d.valorReais === 50), "merge deve preferir arquivo HB mais recente");
  assert.ok(
    !row?.contaCoopDescontos?.some((d) => d.valorReais === 999),
    "merge não deve ressuscitar descontos HB obsoletos da nuvem"
  );
}

{
  const MES = "2026-09";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", MES)],
    notasPedido: [{ ...nota("n1", "conferida"), mesReferencia: MES }],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — aparelho",
      valorReais: 50,
      tipo: "conta_coop",
      createdAt: "2026-09-10T10:00:00.000Z",
    },
  ]);
  const localArquivo = data.arquivosMensais.find(
    (a) => a.cooperadoId === COOPERADO && a.mesReferencia === MES
  )!;
  const cloudSemHb = {
    ...localArquivo,
    updatedAt: "2026-09-20T12:00:00.000Z",
    contaCoopDescontos: undefined,
    contaCoopDescontosUpdatedAt: undefined,
  };
  const merged = mergeArquivosMensaisFromCloud(data, [localArquivo], [cloudSemHb]);
  const row = merged.find((a) => a.mesReferencia === MES);
  assert.ok(
    row?.contaCoopDescontos?.some((d) => d.valorReais === 50),
    "nuvem com updatedAt mais novo não pode apagar descontos HB locais"
  );
}

{
  const MES = "2026-09";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", MES)],
    notasPedido: [{ ...nota("n1", "conferida"), mesReferencia: MES }],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — snapshot",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-09-10T10:00:00.000Z",
    },
  ]);
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  const snapshot = getResumoPagamentoParaRegistro(base, data, COOPERADO, MES, COOP);
  const opts = buildValorExibicaoCooperadoOpts(data, COOPERADO, MES, COOP);
  const linhas = getDescontosExtrasExibicaoCooperado(snapshot, opts);

  assert.ok(
    snapshot.descontosExtras.some((d) => d.tipo === "conta_coop"),
    "snapshot de pagamento deve carregar linhas conta_coop"
  );
  assert.ok(
    linhas.some((d) => d.tipo === "conta_coop"),
    "exibição cooperado não pode ocultar HB quando snapshot já tem desconto"
  );
}

// 1) Ficha da nuvem antes das notas conferidas = incompleto (deve recuperar)
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2")],
    notasPedido: [nota("n1", "aguardando_conferencia"), nota("n2", "aguardando_conferencia")],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    true,
    "ficha com notas ainda não conferidas localmente deve ser incompleto"
  );
}

// 2) notasSyncProvavelmenteCompleto só conta conferida/pago
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2"), ficha("f3", "n3"), ficha("f4", "n4")],
    notasPedido: [nota("n1", "aguardando_conferencia"), nota("n2", "aguardando_conferencia"), nota("n3", "aguardando_conferencia"), nota("n4", "aguardando_conferencia")],
  });
  assert.equal(
    notasSyncProvavelmenteCompleto(data, COOP),
    false,
    "notas em análise não devem marcar sync como completo"
  );
}

// 3) purgar não apaga tudo quando há conferidas e sync incompleto
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1"), ficha("f2", "n2")],
    notasPedido: [nota("n1", "conferida"), nota("n2", "aguardando_conferencia")],
  });
  const next = purgarFichasInvalidas(data);
  assert.ok(next.fichaCorrida.length > 0, "purgar não deve zerar ficha com conferidas parciais");
}

// 4) Cooperado sem histórico de entregas = financeiro ok (não bloqueia o app)
{
  const data = baseData({
    notasPedido: [nota("n0", "rascunho")],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    false,
    "cooperado só com rascunho não deve ser tratado como financeiro ausente"
  );
}

// 5) reconciliar cria ficha a partir de conferidas antes de purgar
{
  const data = baseData({
    notasPedido: [nota("n1", "conferida")],
  });
  const next = reconciliarFichaFromNotasConferidas(data);
  assert.ok(
    next.fichaCorrida.some((f) => f.notaPedidoId === "n1"),
    "reconciliar deve materializar ficha da nota conferida"
  );
  assert.equal(
    cooperadoFinanceiroLocalAusente(next, COOPERADO, COOP),
    false,
    "após reconciliar, financeiro deve estar pronto"
  );
}

{
  const jeferson = "c_1781981564381_w67gg";
  const orlando = "c_1782263929381_ncp55";
  assert.equal(
    resolveMobileCooperadoId({
      email: "jefersonabreudeaguiar@gmail.com",
      role: "cooperado",
      cooperadoId: jeferson,
    }),
    jeferson,
    "conta cooperado real não pode ser trocada pelo vínculo mobile da equipe"
  );
  assert.equal(
    resolveMobileCooperadoId({
      email: "jefersonabreudeaguiar@gmail.com",
      role: "responsavel",
    }),
    orlando,
    "responsável no celular mantém vínculo de teste (Orlando)"
  );
}

{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n1", "2026-08"), ficha("f2", "n2", "2026-09")],
    notasPedido: [nota("n1", "conferida"), nota("n2", "conferida")],
  });
  const resp = listarMesesPendentesPagamentoResponsavel(data, COOPERADO, COOP);
  const coop = listarMesesPendentesQuantoVouReceber(data, COOPERADO, COOP);
  assert.deepEqual(resp, coop, "meses pendentes responsável = cooperado");
  const fin = getConsolidadoFinanceiroCooperado(data, COOPERADO, COOP);
  const v = getValorQuantoVouReceber(data, COOPERADO, COOP);
  assert.equal(fin.valorLiquido, v.valor, "consolidado = quanto vou receber");
  assert.equal(fin.resumo.valorLiquido, v.valor, "resumo consolidado = total exibido");
}

{
  const data = baseData({
    fichaCorrida: [ficha("f_mens", "n_mens", "2026-08")],
    notasPedido: [nota("n_mens", "conferida")],
    arquivosMensais: [
      {
        id: "arq_mens",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: "2026-08",
        notaPedidoIds: ["n_mens"],
        pagamentoIds: [],
        mensalidadeFixa: 60,
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  const fin = getConsolidadoFinanceiroCooperado(data, COOPERADO, COOP);
  const baseReais = getCreditoBaseContaCoopReais(data, COOPERADO, COOP);
  assert.equal(baseReais, fin.valorLiquido, "crédito base HB = valor a receber (não entregas brutas)");
  assert.equal(baseReais, 40, "mensalidade R$60 sobre entrega R$100 → base R$40");
  assert.equal(getCreditoBaseCooperadoCents(data, COOPERADO, COOP), 4000);
}

{
  const CLEBER = "c_cleber_phantom";
  const MES = "2026-08";
  const data = baseData({
    cooperados: [
      {
        id: CLEBER,
        cooperativaId: COOP,
        nomeCompleto: "Cleber phantom",
        cpf: "54718015200",
        status: "ativo",
        createdAt: "",
      },
    ],
    fichaCorrida: [
      {
        ...ficha("f_phantom", "n1", MES),
        cooperadoId: CLEBER,
        status: "pago",
        valorBruto: 500,
        valorLiquido: 500,
      },
    ],
    notasPedido: [{ ...nota("n1", "pago"), cooperadoId: CLEBER }],
    pagamentosCooperado: [],
  });
  const aPagar = getResumoValorAPagarRelatorio(data, CLEBER, MES, COOP).valorLiquido;
  assert.ok(aPagar > 0, "Cleber: ficha paga sem pagamentoCooperado deve aparecer com valor");
  assert.equal(
    cooperadoPendentePagamentoResponsavel(data, CLEBER, undefined, COOP),
    true,
    "Cleber: deve constar na fila Pagar"
  );
}

console.log("OK — guard financeiro cooperado");
