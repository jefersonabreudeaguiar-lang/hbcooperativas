/**
 * Contrato Conferir → Correções — lista quem tem nota sem liquidar.
 * Relançar e apagar não mexem no que já foi pago.
 * npx tsx scripts/test-responsavel-conferir-correcoes-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  RESPONSAVEL_CONFERIR_CORRECOES_CONTRATO_VERSION,
  RESPONSAVEL_CONFERIR_CORRECOES_TITULO,
  correcoesLeemLastroRealNaoFotoAlinhada,
  correcoesNaoMexemNotaLiquidada,
} from "../src/lib/responsavel/responsavelConferirCorrecoesContrato.ts";
import {
  excluirEntregaNota,
  listarCooperadosEntregasCorrecao,
  listarCooperadosEntregasCorrecaoTodas,
  podeExcluirEntregaNota,
  podeRelancarEntregaNota,
  relancarEntregaNota,
} from "../src/services/notaPedidoService.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const COOP = "coop-correcoes-lock";
const MES = "2026-10";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert.equal(RESPONSAVEL_CONFERIR_CORRECOES_CONTRATO_VERSION, 1);
assert.equal(RESPONSAVEL_CONFERIR_CORRECOES_TITULO, "Correções de entregas");
assert.equal(correcoesLeemLastroRealNaoFotoAlinhada(), true);
assert.equal(correcoesNaoMexemNotaLiquidada(), true);

const staffUi = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.match(staffUi, /isAppDataWarm\(\) \? getData\(\)/);
assert.match(staffUi, /executarRelancarEntregaResponsavel/);
assert.match(staffUi, /executarExclusaoEntregaResponsavel/);

const panelUi = read("src/components/notas/CorrecoesEntregasPanel.tsx");
assert.match(panelUi, /listarCooperadosEntregasCorrecaoTodas/);
assert.match(panelUi, /Cooperados com nota sem liquidar/);
assert.match(panelUi, /Nenhum cooperado com nota ainda sem liquidar/);

const projection = read("src/hooks/useConferirProjection.ts");
assert.match(projection, /appDataParaConferirLeitura\(d, coopId\)/);

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" }],
    cooperados: [
      {
        id: "c-aberto",
        nomeCompleto: "Maria Aberta",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "maria@pix",
      },
      {
        id: "c-pago",
        nomeCompleto: "João Pago",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "joao@pix",
      },
    ],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    cotas: [],
    financeiroMensal: [],
    auditLog: [],
    equipe: [],
    comunicados: [],
    votacoes: [],
    prestacaoContas: [],
    contratos: [],
    instituicoes: [],
    produtosInstituicao: [],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    valoresAvulsosReceber: [],
    fechamentosMensais: [],
    arquivosMensais: [],
    livroCaixa: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function notaBase(partial: Partial<NotaPedido> & Pick<NotaPedido, "id" | "cooperadoId" | "status">): NotaPedido {
  return {
    cooperativaId: COOP,
    instituicaoId: "esc-1",
    numeroNota: partial.numeroNota ?? `N-${partial.id}`,
    dataEntrega: "2026-10-05",
    localEntrega: "escola",
    itens: [{ produtoInstituicaoId: "p1", produtoNome: "Alface", unidade: "kg", precoUnitario: 10, quantidade: 5, valorBruto: 50 }],
    valorBruto: 50,
    percentualDescontoCooperativa: 10,
    valorDesconto: 5,
    valorLiquido: 45,
    mesReferencia: MES,
    fotoPedido: "https://foto/nota.jpg",
    fotosPedido: ["https://foto/nota.jpg"],
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
    ...partial,
  } as NotaPedido;
}

function fichaBase(partial: Partial<FichaCorrida> & Pick<FichaCorrida, "id" | "cooperadoId" | "notaPedidoId" | "status">): FichaCorrida {
  return {
    cooperativaId: COOP,
    mesReferencia: MES,
    valorBruto: 50,
    valorLiquido: 45,
    descontos: 5,
    saldoAcumulado: 0,
    descricao: "entrega",
    dataLancamento: "2026-10-05T10:00:00.000Z",
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
    ...partial,
  } as FichaCorrida;
}

const data = emptyData();
data.notasPedido = [
  notaBase({ id: "n-aberto", cooperadoId: "c-aberto", status: "conferida" }),
  notaBase({ id: "n-pago", cooperadoId: "c-pago", status: "pago", numeroNota: "N-pago" }),
];
data.fichaCorrida = [
  fichaBase({ id: "f-aberto", cooperadoId: "c-aberto", notaPedidoId: "n-aberto", status: "pendente" }),
  fichaBase({ id: "f-pago", cooperadoId: "c-pago", notaPedidoId: "n-pago", status: "pago" }),
];

const lista = listarCooperadosEntregasCorrecaoTodas(data, COOP);
assert.equal(lista.some((c) => c.id === "c-aberto"), true, "cooperado com nota sem liquidar deve aparecer");
assert.equal(lista.some((c) => c.id === "c-pago"), false, "cooperado só com nota paga não aparece");

const relancarLista = listarCooperadosEntregasCorrecao(data, COOP, "relancar");
assert.equal(relancarLista.map((c) => c.id).join(","), "c-aberto");

const rel = relancarEntregaNota(data, "n-aberto", COOP);
assert.equal(rel.ok, true);
if (rel.ok) {
  const nota = rel.data.notasPedido.find((n) => n.id === "n-aberto");
  assert.equal(nota?.status, "aguardando_conferencia");
  assert.equal(nota?.itens.length, 0);
  assert.equal(nota?.fotoPedido, "https://foto/nota.jpg");
  assert.deepEqual(nota?.fotosPedido, ["https://foto/nota.jpg"]);
  assert.equal(rel.data.fichaCorrida.some((f) => f.notaPedidoId === "n-aberto"), false);
}

const relPago = podeRelancarEntregaNota(data, "n-pago", COOP);
assert.equal(relPago.ok, false);
if (!relPago.ok) assert.equal(relPago.reason, "pago");

const apagar = excluirEntregaNota(data, "n-aberto", COOP);
assert.equal(apagar.ok, true);
if (apagar.ok) {
  assert.equal(apagar.data.notasPedido.some((n) => n.id === "n-aberto"), false);
  assert.equal(apagar.data.fichaCorrida.some((f) => f.notaPedidoId === "n-aberto"), false);
  assert.equal(
    (apagar.data.notasPedidoExcluidas ?? []).some((e) => e.id === "n-aberto" && e.cooperativaId === COOP),
    true
  );
}

const apagarPago = podeExcluirEntregaNota(data, "n-pago", COOP);
assert.equal(apagarPago.ok, false);
if (!apagarPago.ok) assert.equal(apagarPago.reason, "pago");

const comPix: AppData = {
  ...data,
  pagamentosCooperado: [
    {
      id: "pix-1",
      cooperativaId: COOP,
      cooperadoId: "c-aberto",
      status: "confirmado",
      valor: 45,
      mesReferencia: MES,
      notaPedidoIds: ["n-aberto"],
      fichaIds: ["f-aberto"],
      pagoEm: "2026-10-10T12:00:00.000Z",
      createdAt: "2026-10-10T12:00:00.000Z",
    } as PagamentoCooperadoRegistro,
  ],
};
const bloqueadoPix = podeRelancarEntregaNota(comPix, "n-aberto", COOP);
assert.equal(bloqueadoPix.ok, false);
if (!bloqueadoPix.ok) assert.equal(bloqueadoPix.reason, "em_pagamento");

console.log("ok: correcoes lista cooperado sem liquidar; relancar/apagar bloqueiam pago e PIX");
