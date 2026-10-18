/**
 * PIX confirmado: ficha vira paga, sai de Em aberto e entra no Livro Caixa.
 * npx tsx scripts/test-pix-confirmado-sai-em-aberto-entra-caixa.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import { listarFichasEmAbertoPagamento } from "../src/services/notaPedidoService.ts";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService.ts";
import { calcularResumoPorCooperadoLivroCaixaCompleto } from "../src/services/livroCaixaResumoCooperado.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";

const COOP = "coop-1";
const CID = "c-1";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "12345678000199", active: true }],
    cooperados: [
      {
        id: CID,
        nomeCompleto: "Cooperado Teste",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "pix@test",
      },
    ],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    arquivosMensais: [],
    descontos: [],
    livroCaixa: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function nota(partial: Partial<NotaPedido> & { id: string }): NotaPedido {
  return {
    cooperadoId: CID,
    cooperativaId: COOP,
    mesReferencia: "2026-10",
    status: "conferida",
    valorLiquido: 82,
    valorBruto: 100,
    itens: [],
    createdAt: "2026-10-02T00:00:00.000Z",
    dataEntrega: "2026-10-02",
    dataConferencia: "2026-10-02T00:00:00.000Z",
    ...partial,
  } as NotaPedido;
}

function ficha(partial: Partial<FichaCorrida> & { id: string; notaPedidoId: string }): FichaCorrida {
  return {
    cooperadoId: CID,
    cooperativaId: COOP,
    mesReferencia: "2026-10",
    status: "pendente",
    descricao: partial.id,
    valorBruto: 100,
    valorLiquido: 82,
    descontos: 18,
    descontosDetalhe: [
      { tipo: "cooperativa", motivo: "Taxa", valor: 10 },
      { tipo: "mensalidade", motivo: "Outubro", valor: 5 },
      { tipo: "conta_coop", motivo: "HB Créditos", valor: 3 },
    ],
    dataLancamento: "2026-10-02T00:00:00.000Z",
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    ...partial,
  } as FichaCorrida;
}

function pix(partial: Partial<PagamentoCooperadoRegistro> = {}): PagamentoCooperadoRegistro {
  return {
    id: "pg-1",
    cooperativaId: COOP,
    cooperadoId: CID,
    mesReferencia: "2026-10",
    status: "confirmado",
    valorLiquido: 82,
    valorBruto: 0,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f-id-velho"],
    notaPedidoIds: [],
    pagoPor: "resp",
    pagoEm: "2026-10-20T12:00:00.000Z",
    createdAt: "2026-10-20T12:00:00.000Z",
    ...partial,
  } as PagamentoCooperadoRegistro;
}

{
  const data = emptyData();
  data.notasPedido = [
    nota({
      id: "n1",
      createdAt: "2026-10-21T00:00:00.000Z",
      dataConferencia: "2026-10-21T00:00:00.000Z",
    }),
  ];
  data.fichaCorrida = [
    ficha({
      id: "f1",
      notaPedidoId: "n1",
      createdAt: "2026-10-21T00:00:00.000Z",
      dataLancamento: "2026-10-21T00:00:00.000Z",
    }),
  ];
  data.pagamentosCooperado = [pix()];

  assert.equal(
    listarFichasEmAbertoPagamento(data, CID, "2026-10", COOP).length,
    0,
    "dataEntrega original + PIX confirmado tira a ficha do em aberto mesmo com createdAt refeito"
  );

  resetResponsavelPainelIndexCache();
  const emAbertoAntes = getRelatorioLancamentosEmAbertoResponsavel(data, COOP);
  assert.equal(emAbertoAntes.length, 0, "Conferir Em aberto não lista cooperado já pago");

  const next = posProcessarIntegridadePagamentosCooperativa(data);
  const fichaPaga = next.fichaCorrida.find((f) => f.id === "f1");
  assert.equal(fichaPaga?.status, "pago", "ficha coberta pelo PIX vira paga");

  const livro = next.livroCaixa ?? [];
  assert.ok(livro.some((l) => l.origemId === "pg_caixa_pg-1" && l.tipo === "debito" && l.valor === 100));
  assert.ok(livro.some((l) => l.origemId === "pg_taxa_pg-1" && l.tipo === "credito" && l.valor === 10));
  assert.ok(livro.some((l) => l.origem === "mensalidade_ficha" && l.valor === 5));
  assert.ok(livro.some((l) => l.origem === "desconto_ficha" && l.valor === 3));

  const resumo = calcularResumoPorCooperadoLivroCaixaCompleto(next, livro, COOP);
  assert.equal(resumo[0]?.totalBruto, 100);
  assert.equal(resumo[0]?.creditoTaxa, 10);
  assert.equal(resumo[0]?.creditoMensalidade, 5);
  assert.equal(resumo[0]?.creditoOutros, 3);
  assert.equal(resumo[0]?.debitoPagamento, 100);

  resetResponsavelPainelIndexCache();
  assert.equal(getRelatorioLancamentosEmAbertoResponsavel(next, COOP).length, 0);
}

{
  const data = emptyData();
  data.notasPedido = [
    nota({ id: "n-pago", dataEntrega: "2026-10-02", createdAt: "2026-10-02T00:00:00.000Z" }),
    nota({
      id: "n-nova",
      dataEntrega: "2026-10-25",
      createdAt: "2026-10-25T00:00:00.000Z",
      dataConferencia: "2026-10-25T00:00:00.000Z",
      valorLiquido: 40,
      valorBruto: 45,
    }),
  ];
  data.fichaCorrida = [
    ficha({ id: "f-pago", notaPedidoId: "n-pago" }),
    ficha({
      id: "f-nova",
      notaPedidoId: "n-nova",
      valorBruto: 45,
      valorLiquido: 40,
      descontos: 5,
      dataLancamento: "2026-10-25T00:00:00.000Z",
      createdAt: "2026-10-25T00:00:00.000Z",
    }),
  ];
  data.pagamentosCooperado = [pix({ fichaIds: ["f-id-velho"] })];

  const next = posProcessarIntegridadePagamentosCooperativa(data);
  assert.equal(next.fichaCorrida.find((f) => f.id === "f-pago")?.status, "pago");
  assert.equal(next.fichaCorrida.find((f) => f.id === "f-nova")?.status, "pendente");
  assert.equal(listarFichasEmAbertoPagamento(next, CID, "2026-10", COOP).map((f) => f.id).join(), "f-nova");
}

console.log("ok: PIX confirmado sai de Em aberto, fica pago e entra no Livro Caixa");
