/**
 * Regressão: pacote contábil do livro caixa (CSV/ZIP).
 * Uso: npx tsx scripts/test-livro-caixa-export-contabil.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  buildLivroCaixaPacoteContabil,
  naturezaMovimentoLivroCaixa,
} from "../src/services/livroCaixaExportContabil.ts";
import {
  lancarPagamentoCooperadoNoCaixa,
  reconciliarLivroCaixaContabilCooperativa,
} from "../src/services/livroCaixaService.ts";

const COOP = "coop-1";
const COOPERADO = "coop-user-1";

function baseData(partial: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop Teste", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    users: [],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Cleito Teste",
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
      },
    ],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: partial.notasPedido ?? [],
    fichaCorrida: partial.fichaCorrida ?? [],
    pagamentosCooperado: partial.pagamentosCooperado ?? [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    votacaoPautas: [],
    votacaoVotos: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

const pagamento: PagamentoCooperadoRegistro = {
  id: "pg_test_1",
  cooperativaId: COOP,
  cooperadoId: COOPERADO,
  mesReferencia: "2026-09",
  valorBruto: 1000,
  descontoCooperativa: 50,
  descontosExtras: [
    { tipo: "mensalidade", motivo: "Mensalidade app", valor: 14.9 },
    { tipo: "conta_coop", motivo: "Compra HB Créditos — mercado", valor: 100 },
  ],
  valorLiquido: 835.1,
  fichaIds: ["f1"],
  notaPedidoIds: ["n1"],
  status: "confirmado",
  pagoPor: "Responsável",
  pagoEm: "2026-09-15T14:00:00.000Z",
  createdAt: "2026-09-15T14:00:00.000Z",
  updatedAt: "2026-09-15T14:00:00.000Z",
};

let data = baseData({
  fichaCorrida: [
    {
      id: "f1",
      cooperativaId: COOP,
      cooperadoId: COOPERADO,
      notaPedidoId: "n1",
      mesReferencia: "2026-09",
      dataLancamento: "2026-09-10",
      descricao: "Entrega teste",
      valorBruto: 1000,
      descontos: 50,
      valorLiquido: 950,
      status: "pago",
    } as FichaCorrida,
  ],
  notasPedido: [
    {
      id: "n1",
      cooperativaId: COOP,
      mesReferencia: "2026-09",
      status: "conferida",
    } as NotaPedido,
  ],
  pagamentosCooperado: [pagamento],
});

data = lancarPagamentoCooperadoNoCaixa(data, pagamento);
data = reconciliarLivroCaixaContabilCooperativa(data, COOP);

assert.equal(naturezaMovimentoLivroCaixa("taxa_cooperativa"), "retencao_ficha");
assert.equal(naturezaMovimentoLivroCaixa("pagamento_cooperado"), "movimento_caixa");

const pacote = buildLivroCaixaPacoteContabil(data, COOP, "Coop Teste", "62351750000165", {
  modo: "mes",
  mesReferencia: "2026-09",
});

assert.equal(pacote.files.length, 7);
const livro = pacote.files.find((f) => f.name === "02_LIVRO_CAIXA.csv")!.content;
assert.ok(livro.includes("Retenção ficha"), "deve marcar natureza retenção");
assert.ok(livro.includes("Cleito Teste"), "deve incluir cooperado");
assert.ok(livro.includes("12345678901"), "deve incluir CPF");

const eventos = pacote.files.find((f) => f.name === "03_EVENTOS_PAGAMENTO.csv")!.content;
assert.ok(eventos.includes("OK"), "check bruto = líquido + retenções");
assert.ok(eventos.includes("100.00"), "HB na aba eventos");

console.log("test-livro-caixa-export-contabil: OK");
