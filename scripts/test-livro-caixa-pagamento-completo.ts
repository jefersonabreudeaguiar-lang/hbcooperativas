/**
 * PIX confirmado entra no Livro Caixa com bruto, taxa, mensalidade e demais descontos.
 * npx tsx scripts/test-livro-caixa-pagamento-completo.ts
 */
import assert from "node:assert/strict";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  auditarLivroCaixaContabilCooperativa,
  hidratarPagamentoParaLivroCaixa,
  lancarPagamentoCooperadoNoCaixa,
  reconciliarLivroCaixaContabilCooperativa,
} from "../src/services/livroCaixaService.ts";
import { calcularResumoPorCooperadoLivroCaixaCompleto } from "../src/services/livroCaixaResumoCooperado.ts";

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

{
  const data = emptyData();
  data.fichaCorrida = [
    {
      id: "f1",
      cooperadoId: CID,
      cooperativaId: COOP,
      notaPedidoId: "n1",
      mesReferencia: "2026-10",
      status: "pago",
      valorBruto: 100,
      descontos: 18,
      valorLiquido: 82,
      descontosDetalhe: [
        { tipo: "cooperativa", motivo: "Taxa", valor: 10 },
        { tipo: "mensalidade", motivo: "Outubro", valor: 5 },
        { tipo: "conta_coop", motivo: "HB Créditos", valor: 3 },
      ],
      dataLancamento: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-02T00:00:00.000Z",
    },
  ];
  const pix = {
    id: "pg-1",
    cooperativaId: COOP,
    cooperadoId: CID,
    mesReferencia: "2026-10",
    status: "confirmado",
    valorLiquido: 82,
    valorBruto: 0,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
    pagoPor: "resp",
    pagoEm: "2026-10-20T12:00:00.000Z",
    createdAt: "2026-10-20T12:00:00.000Z",
  } as PagamentoCooperadoRegistro;

  const hidratado = hidratarPagamentoParaLivroCaixa(data, pix);
  assert.equal(hidratado.valorBruto, 100);
  assert.equal(hidratado.descontoCooperativa, 10);
  assert.equal(hidratado.descontosExtras.length, 3);

  data.pagamentosCooperado = [pix];
  const next = lancarPagamentoCooperadoNoCaixa(data, pix);
  const livro = next.livroCaixa ?? [];
  assert.ok(livro.some((l) => l.origemId === "pg_caixa_pg-1" && l.tipo === "debito" && l.valor === 82));
  assert.ok(livro.some((l) => l.origemId === "pg_taxa_pg-1" && l.tipo === "credito" && l.valor === 10));
  assert.ok(livro.some((l) => l.origem === "mensalidade_ficha" && l.tipo === "credito" && l.valor === 5));
  assert.ok(livro.some((l) => l.origem === "desconto_ficha" && l.historico.includes("HB Créditos") && l.valor === 3));

  const audit = auditarLivroCaixaContabilCooperativa(next, COOP);
  assert.equal(audit.pagamentosSemDebitoCaixa.length, 0);
  assert.equal(audit.pagamentosSemTaxaCoopCaixa.length, 0);
  assert.equal(audit.pagamentosSemMensalidadeFichaCaixa.length, 0);
  assert.equal(audit.pagamentosSemOutrosDescontosCaixa.length, 0);

  const resumo = calcularResumoPorCooperadoLivroCaixaCompleto(next, livro, COOP);
  assert.equal(resumo.length, 1);
  assert.equal(resumo[0]?.totalBruto, 100);
  assert.equal(resumo[0]?.creditoTaxa, 10);
  assert.equal(resumo[0]?.creditoMensalidade, 5);
  assert.equal(resumo[0]?.creditoOutros, 3);
  assert.equal(resumo[0]?.debitoPagamento, 82);
}

{
  const data = emptyData();
  data.pagamentosCooperado = [
    {
      id: "pg-2",
      cooperativaId: COOP,
      cooperadoId: CID,
      mesReferencia: "2026-09",
      status: "confirmado",
      valorLiquido: 45,
      valorBruto: 50,
      descontoCooperativa: 5,
      descontosExtras: [],
      fichaIds: ["f-x"],
      notaPedidoIds: [],
      pagoPor: "resp",
      pagoEm: "2026-09-20T12:00:00.000Z",
      createdAt: "2026-09-20T12:00:00.000Z",
    } as PagamentoCooperadoRegistro,
  ];
  const rec = reconciliarLivroCaixaContabilCooperativa(data, COOP);
  const livro = rec.livroCaixa ?? [];
  assert.ok(livro.some((l) => l.origemId === "pg_caixa_pg-2" && l.valor === 45));
  assert.ok(livro.some((l) => l.origemId === "pg_taxa_pg-2" && l.valor === 5));
}

console.log("ok: livro caixa — PIX pago entra com bruto, taxa, mensalidade e outros descontos");
