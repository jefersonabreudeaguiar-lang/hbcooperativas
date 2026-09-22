/**
 * Cenários críticos do guard financeiro do cooperado (regressão Orlando).
 * Uso: npm run test:cooperado-financeiro
 */
import assert from "node:assert/strict";
import { cooperadoFinanceiroLocalAusente, cooperadoFinanceiroBloqueiaEntradaApp, notasSyncProvavelmenteCompleto } from "../src/services/fichaSyncGuard.ts";
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
  registrarPagamentoCooperado,
  resumoComplementaresPosPagamento,
  getTotalAPagarCooperado,
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
  cooperadoExibirValorReceberInicio,
  cooperadoPendentePagamentoResponsavel,
  listarMesesPendentesPagamentoResponsavel,
  listarMesesPendentesQuantoVouReceber,
  getConsolidadoFinanceiroCooperado,
} from "../src/services/cooperadoEntregasService.ts";
import {
  getCreditoBaseContaCoopReais,
  getCreditoBaseCooperadoCents,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { resolveMobileCooperadoId } from "../src/lib/hb-credit/mobileCooperadoLink.ts";
import {
  posProcessarIntegridadePagamentosCooperativa,
  sanitizarOperacionalSyncPayload,
} from "../src/services/pagamentoIntegridadeService.ts";
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
  assert.equal(inicio.valor, 0, "Após PIX da cooperativa, a receber zera até assinar o recibo");
  assert.equal(inicio.valorRecibo, 100, "Valor pago fica no registro do recibo");
  assert.equal(inicio.aguardandoAssinatura, true);
}

{
  const MES = "2026-08";
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1")],
    notasPedido: [nota("n1", "conferida")],
  });
  data = registrarPagamentoCooperado(data, COOPERADO, MES, "Responsável teste");
  const pg = data.pagamentosCooperado.find((p) => p.status === "aguardando_confirmacao");
  assert.ok(pg, "registro de pagamento criado");
  const inicio = cooperadoExibirValorReceberInicio(data, COOPERADO, COOP);
  assert.equal(inicio.valor, 0, "Início: a receber zero após pagamento registrado");
  assert.equal(inicio.valorRecibo, pg!.valorLiquido, "Início: mostra valor do recibo");
  assert.equal(inicio.aguardandoAssinatura, true);
  const relatorio = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP);
  assert.equal(relatorio.valorLiquido, 0, "Relatório a receber zera com pagamento aguardando assinatura");
  const fin = getConsolidadoFinanceiroCooperado(data, COOPERADO, COOP);
  assert.equal(fin.valorLiquido, 0, "Consolidado a receber zera");
  assert.equal(fin.resumo.valorLiquido, pg!.valorLiquido, "Resumo congelado no snapshot do pagamento");
}

{
  const MES = "2026-08";
  const data = baseData({
    fichaCorrida: [
      { ...ficha("f1", "n1", MES), status: "pago" },
      { ...ficha("f2", "n2", MES), valorBruto: 50, valorLiquido: 50 },
    ],
    notasPedido: [
      nota("n1", "pago"),
      { ...nota("n2", "conferida"), valorLiquido: 50, valorBruto: 50 },
    ],
    pagamentosCooperado: [
      {
        id: "pg_confirmado_n2",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 100,
        fichaIds: ["f1"],
        notaPedidoIds: ["n1"],
        status: "confirmado",
        pagoPor: "Resp",
        pagoEm: "2026-08-25T12:00:00.000Z",
        assinadoEm: "2026-08-26T12:00:00.000Z",
        createdAt: "2026-08-25T12:00:00.000Z",
      },
    ],
    arquivosMensais: [
      {
        id: "am_ago",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        notaPedidoIds: ["n1"],
        pagamentoIds: ["pg_confirmado_n2"],
        mensalidadeFixa: 0,
        updatedAt: "2026-08-26T12:00:00.000Z",
      },
    ],
  });
  const aReceber = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP).valorLiquido;
  const card = getValorQuantoVouReceber(data, COOPERADO, COOP);
  const baseMes = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  assert.equal(baseMes.valorEntregas, 50, "Resumo vivo considera só a nova ficha pendente");
  assert.ok(aReceber > 0, "Nova entrega após recibo assinado volta a gerar valor a receber");
  const complementar = resumoComplementaresPosPagamento(data, COOPERADO, MES, COOP);
  assert.ok(complementar, "Resumo complementar pós-PIX");
  assert.equal(aReceber, complementar.valorLiquido, "Relatório e resumo alinhados");
  assert.equal(card.valor, aReceber, "Início/ficha refletem o pendente novo");
  assert.equal(card.aguardandoAssinatura, false);
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
  assert.equal(
    cooperadoFinanceiroBloqueiaEntradaApp(data, COOPERADO, COOP),
    false,
    "com notas locais o app não deve travar em tela cheia"
  );
}

// 1b) Ficha órfã (nota ainda não baixada) ≠ financeiro ausente
{
  const data = baseData({
    fichaCorrida: [ficha("f1", "n_só_nuvem"), ficha("f2", "n2_nuvem")],
    notasPedido: [],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    false,
    "ficha sem nota local durante sync não deve marcar ausente"
  );
  assert.equal(
    cooperadoFinanceiroBloqueiaEntradaApp(data, COOPERADO, COOP),
    false,
    "ficha parcial da nuvem deve liberar navegação"
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

// 4b) Mês quitado (ficha pago + nota pago) ≠ financeiro ausente — evita gate eterno
{
  const MES = "2026-08";
  const data = baseData({
    fichaCorrida: [{ ...ficha("f1", "n1", MES), status: "pago" }],
    notasPedido: [nota("n1", "pago")],
    pagamentosCooperado: [
      {
        id: "pg_ok",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 100,
        fichaIds: ["f1"],
        notaPedidoIds: ["n1"],
        status: "confirmado",
        pagoPor: "Resp",
        pagoEm: "2026-08-20T12:00:00.000Z",
        createdAt: "2026-08-20T12:00:00.000Z",
      },
    ],
  });
  assert.equal(
    cooperadoFinanceiroLocalAusente(data, COOPERADO, COOP),
    false,
    "histórico pago com ficha na nuvem não deve bloquear cooperado"
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
    jeferson,
    "responsável no celular usa vínculo do próprio cooperado (Jeferson)"
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

{
  const CLEITO = "c_cleito_div";
  const IVAN = "c_ivan_div";
  const NOTA = "n_div";
  const MES = "2026-08";
  const data = baseData({
    cooperados: [
      {
        id: CLEITO,
        cooperativaId: COOP,
        nomeCompleto: "Cleito",
        cpf: "11111111111",
        status: "ativo",
        createdAt: "",
      },
      {
        id: IVAN,
        cooperativaId: COOP,
        nomeCompleto: "Ivan divisão",
        cpf: "22222222222",
        status: "ativo",
        createdAt: "",
      },
    ],
    notasPedido: [
      {
        ...nota(NOTA, "pago"),
        cooperadoId: CLEITO,
        mesReferencia: MES,
        divisaoEntrega: {
          cooperadoOrigemId: CLEITO,
          cooperadoOrigemNome: "Cleito",
          participantes: [
            { cooperadoId: CLEITO, cooperadoNome: "Cleito" },
            { cooperadoId: IVAN, cooperadoNome: "Ivan divisão" },
          ],
          divididoEm: new Date().toISOString(),
        },
      },
    ],
    pagamentosCooperado: [
      {
        id: "pg_cleito",
        cooperadoId: CLEITO,
        cooperativaId: COOP,
        mesReferencia: MES,
        status: "confirmado",
        valorLiquido: 100,
        valorBruto: 100,
        pagoEm: new Date().toISOString(),
        pagoPor: "resp",
        fichaIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    fichaCorrida: [
      {
        ...ficha("f_cleito_phantom", NOTA, MES),
        cooperadoId: CLEITO,
        status: "pago",
        valorLiquido: 50,
      },
      {
        ...ficha("f_ivan_phantom", NOTA, MES),
        cooperadoId: IVAN,
        status: "pago",
        valorLiquido: 50,
      },
    ],
  });
  const fixed = reconciliarFichaFromNotasConferidas(data);
  const ivanFicha = fixed.fichaCorrida.find((f) => f.cooperadoId === IVAN && f.notaPedidoId === NOTA);
  assert.equal(
    ivanFicha?.status,
    "pendente",
    "divisão: participante sem PIX não permanece pago quando titular quitou"
  );
  assert.equal(
    cooperadoPendentePagamentoResponsavel(fixed, IVAN, undefined, COOP),
    true,
    "Ivan divisão: fila Pagar"
  );
}

{
  const MES = "2026-09";
  const ENTREGAS = 233.32;
  let data = baseData({
    fichaCorrida: [
      {
        ...ficha("f_set", "n_set", MES),
        valorBruto: ENTREGAS,
        valorLiquido: ENTREGAS,
        descontos: 0,
      },
    ],
    notasPedido: [{ ...nota("n_set", "conferida"), mesReferencia: MES, valorLiquido: ENTREGAS }],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — Mercado teste (estornada)",
      valorReais: 100,
      tipo: "conta_coop",
      createdAt: "2026-09-01T17:31:46.000Z",
    },
    {
      motivo: "Estorno HB Créditos — Mercado teste",
      valorReais: 100,
      tipo: "conta_coop",
      createdAt: "2026-09-01T18:00:24.459Z",
    },
    {
      motivo: "Compra HB Créditos — Mercado teste (estornada)",
      valorReais: 150,
      tipo: "conta_coop",
      createdAt: "2026-09-01T18:35:23.000Z",
    },
    {
      motivo: "Estorno HB Créditos — Mercado teste",
      valorReais: 150,
      tipo: "conta_coop",
      createdAt: "2026-09-01T18:41:54.581Z",
    },
    {
      motivo: "Compra HB Créditos — Casa do Cacau (009AEE5F)",
      valorReais: 79.9,
      tipo: "conta_coop",
      createdAt: "2026-09-01T19:22:36.725Z",
    },
  ]);
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  const aReceber = getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP);
  const esperado = round2(ENTREGAS - 79.9);
  assert.equal(base.valorLiquido, esperado, "pares estorno zeram; só compra ativa abate");
  assert.ok(
    base.descontosExtras.filter((d) => d.tipo === "conta_coop").length >= 3,
    "resumo deve listar compras (incl. estornadas) e estornos"
  );
  assert.ok(
    base.descontosExtras.some((d) => d.tipo === "credito_avulso" && d.valor === 100),
    "estorno visível como crédito"
  );
  assert.equal(aReceber.valorLiquido, esperado, "exibição/relatório alinhados ao base");
  assert.equal(
    getResumoValorAPagarRelatorio(data, COOPERADO, MES, COOP).valorLiquido,
    esperado,
    "idempotência: segundo cálculo igual"
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

{
  const CLEBER = "c_cleber_sanitize";
  const payload = {
    updatedAt: new Date().toISOString(),
    fichaCorrida: [
      {
        id: "fc_phantom",
        cooperativaId: COOP,
        cooperadoId: CLEBER,
        notaPedidoId: "n1",
        mesReferencia: "2026-08",
        status: "pago" as const,
        valorLiquido: 100,
        valorBruto: 100,
        descontos: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
  };
  const sanitized = sanitizarOperacionalSyncPayload(payload, reconciliarFichaFromNotasConferidas);
  assert.equal(sanitized.fichaCorrida?.[0]?.status, "pendente", "sync API deve reverter pago fantasma");
}

{
  const data = baseData({
    notasPedido: [nota("n_antiga", "conferida"), { ...nota("n_nova", "conferida"), mesReferencia: "2026-09" }],
    fichaCorrida: [
      ficha("f_antiga", "n_antiga", "2026-08"),
      ficha("f_nova", "n_nova", "2026-09"),
    ],
    pagamentosCooperado: [
      {
        id: "pg_1",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: "2026-08",
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 100,
        fichaIds: ["f_antiga"],
        notaPedidoIds: ["n_antiga"],
        status: "confirmado",
        pagoPor: "resp",
        pagoEm: "2026-08-10T12:00:00.000Z",
        createdAt: "2026-08-10T12:00:00.000Z",
      },
    ],
  });
  const pos = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));
  const novaPendente = pos.fichaCorrida.find((f) => f.id === "f_nova");
  assert.equal(novaPendente?.status, "pendente", "nota nova no mesmo mês calendário não pode herdar PIX antigo");
  assert.ok(
    getTotalAPagarCooperado(pos, COOPERADO, undefined, COOP) > 0,
    "valor a receber deve incluir notas lançadas após pagamento"
  );
}

{
  const data = baseData({
    notasPedido: [
      { ...nota("n_no_pix", "conferida"), mesReferencia: "2026-09" },
      { ...nota("n_pos_pix", "conferida"), mesReferencia: "2026-09", createdAt: "2026-09-22T10:00:00.000Z" },
    ],
    pagamentosCooperado: [
      {
        id: "pg_mes",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: "2026-09",
        mesesReferencia: ["2026-09"],
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 100,
        fichaIds: ["f_no_pix"],
        notaPedidoIds: ["n_no_pix"],
        status: "confirmado",
        pagoPor: "resp",
        pagoEm: "2026-09-21T12:00:00.000Z",
        createdAt: "2026-09-21T12:00:00.000Z",
      },
    ],
    fichaCorrida: [ficha("f_no_pix", "n_no_pix", "2026-09")],
  });
  const rec = reconciliarFichaFromNotasConferidas(data);
  assert.ok(
    rec.fichaCorrida.some((f) => f.notaPedidoId === "n_pos_pix" && f.status === "pendente"),
    "nota conferida após PIX do mês deve gerar ficha pendente"
  );
  const pos = posProcessarIntegridadePagamentosCooperativa(rec);
  assert.equal(
    pos.fichaCorrida.find((f) => f.notaPedidoId === "n_pos_pix")?.status,
    "pendente",
    "posProcessar não pode marcar como pago nota fora do PIX"
  );
  assert.ok(
    getTotalAPagarCooperado(pos, COOPERADO, undefined, COOP) > 0,
    "cooperado deve ver valor da nota pós-pagamento"
  );
  const cardPos = getValorQuantoVouReceber(pos, COOPERADO, COOP);
  assert.ok(cardPos.valor > 0, "card Quanto vou receber deve refletir nota pós-PIX");
}

{
  const data = baseData({
    notasPedido: [
      { ...nota("n_no_pix", "conferida"), mesReferencia: "2026-09" },
      { ...nota("n_pos_pix", "conferida"), mesReferencia: "2026-09", createdAt: "2026-09-22T10:00:00.000Z" },
    ],
    pagamentosCooperado: [
      {
        id: "pg_mes",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: "2026-09",
        valorBruto: 100,
        descontoCooperativa: 0,
        descontosExtras: [{ tipo: "mensalidade", motivo: "Mensalidade", valor: 60 }],
        valorLiquido: 40,
        fichaIds: ["f_no_pix"],
        notaPedidoIds: ["n_no_pix"],
        status: "confirmado",
        pagoPor: "resp",
        pagoEm: "2026-09-21T12:00:00.000Z",
        createdAt: "2026-09-21T12:00:00.000Z",
      },
    ],
    fichaCorrida: [ficha("f_no_pix", "n_no_pix", "2026-09")],
  });
  const rec = reconciliarFichaFromNotasConferidas(data);
  const pos = posProcessarIntegridadePagamentosCooperativa(rec);
  const fin = getConsolidadoFinanceiroCooperado(pos, COOPERADO, COOP);
  assert.ok(fin.valorLiquido > 0, "consolidado cooperado deve mostrar complemento pós-PIX");
  assert.equal(
    fin.resumo.descontosExtras.filter((d) => d.tipo === "mensalidade").length,
    0,
    "complemento pós-PIX não repete mensalidade do pagamento antigo"
  );
}

{
  const MES = "2026-09";
  const data = baseData({
    notasPedido: [
      {
        ...nota("n_foto_antiga", "conferida"),
        mesReferencia: MES,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-22T18:00:00.000Z",
        dataConferencia: "2026-09-22T18:00:00.000Z",
      },
    ],
    pagamentosCooperado: [
      {
        id: "pg_mes_implicito",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        mesesReferencia: [MES],
        valorBruto: 500,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 500,
        fichaIds: [],
        notaPedidoIds: [],
        status: "confirmado",
        pagoPor: "resp",
        pagoEm: "2026-09-21T12:00:00.000Z",
        createdAt: "2026-09-21T12:00:00.000Z",
      },
    ],
  });
  const rec = reconciliarFichaFromNotasConferidas(data);
  const fichaNova = rec.fichaCorrida.find((f) => f.notaPedidoId === "n_foto_antiga");
  assert.equal(fichaNova?.status, "pendente", "conferência após PIX não usa só createdAt da foto");
  const total = getTotalAPagarCooperado(rec, COOPERADO, undefined, COOP);
  const card = getValorQuantoVouReceber(rec, COOPERADO, COOP);
  assert.ok(total > 0, "total responsável inclui nota conferida após pagamento");
  assert.equal(card.valor, total, "card cooperado usa mesma base do responsável");
}

console.log("OK — guard financeiro cooperado");
