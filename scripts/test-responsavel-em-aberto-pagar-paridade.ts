/**
 * Em aberto (Conferir) e Pagar cooperados mostram o mesmo R$ da ficha sem PIX.
 * npx tsx scripts/test-responsavel-em-aberto-pagar-paridade.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { getRelatorioPagarCooperadoEmAberto } from "../src/services/relatorioService.ts";
import {
  pickResumoStaffFichaPagar,
  valorAPagarCooperadoEmAberto,
} from "../src/lib/responsavel/responsavelGestaoLeitura.ts";

const COOP = "coop-paridade-aberto";
const MES = "2026-10";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" }],
    cooperados: [
      {
        id: "c-1",
        nomeCompleto: "Maria Entrega",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "maria@pix",
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

const ficha = {
  id: "f-1",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  mesReferencia: MES,
  notaPedidoId: "n-1",
  status: "pendente",
  valorBruto: 110,
  valorLiquido: 100,
  descontos: 10,
  descricao: "aberto",
  dataLancamento: "2026-10-02T00:00:00.000Z",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
} as FichaCorrida;

const nota = {
  id: "n-1",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  instituicaoId: "esc-1",
  numeroNota: "1",
  dataEntrega: "2026-10-02",
  localEntrega: "Escola",
  mesReferencia: MES,
  status: "conferida",
  valorBruto: 110,
  percentualDescontoCooperativa: 10,
  valorDesconto: 10,
  valorLiquido: 100,
  itens: [],
  createdAt: "2026-10-02T00:00:00.000Z",
} as NotaPedido;

const data: AppData = { ...emptyData(), fichaCorrida: [ficha], notasPedido: [nota] };

resetResponsavelPainelIndexCache();
const linhas = getRelatorioLancamentosEmAbertoResponsavel(data, COOP);
assert.equal(linhas.length, 1);
assert.equal(linhas[0]?.total, 100, "Em aberto = líquido da ficha");

const motor = valorAPagarCooperadoEmAberto(data, "c-1", COOP);
assert.equal(motor.total, 100);
assert.equal(linhas[0]?.total, motor.total, "lista Em aberto = motor único");

const pagar = pickResumoStaffFichaPagar({
  data,
  cooperadoId: "c-1",
  cooperativaId: COOP,
  mesesPendentesPagamento: [MES],
  resumoPagamentoConsolidado: null,
  financeiroAberto: null,
  mesAtivo: MES,
  fluxoReciboAssinatura: false,
});
assert.ok(pagar, "Pagar tem resumo");
assert.equal(pagar?.valorLiquido, linhas[0]?.total, "Pagar e Em aberto são o mesmo R$");
assert.equal(
  getRelatorioPagarCooperadoEmAberto(data, COOP)[0]?.total,
  linhas[0]?.total,
  "relatório motor = Em aberto"
);

const fotoConferirPago = {
  ...data,
  notasPedido: data.notasPedido.map((n) => ({ ...n, status: "pago" as const })),
  fichaCorrida: data.fichaCorrida.map((f) => ({ ...f, status: "pago" as const })),
} as AppData;
resetResponsavelPainelIndexCache();
const aindaAberto = getRelatorioLancamentosEmAbertoResponsavel(fotoConferirPago, COOP);
assert.equal(aindaAberto[0]?.total, 100, "foto do Conferir não muda o R$ sem PIX");

const comAvulso = {
  ...data,
  valoresAvulsosReceber: [
    {
      id: "av-1",
      cooperativaId: COOP,
      cooperadoId: "c-1",
      mesReferencia: MES,
      natureza: "debito",
      valor: 15,
      motivo: "Adiantamento",
      status: "pendente",
      responsavel: "resp",
      dataLancamento: "2026-10-04T00:00:00.000Z",
      createdAt: "2026-10-04T00:00:00.000Z",
      updatedAt: "2026-10-04T00:00:00.000Z",
    },
  ],
} as AppData;
resetResponsavelPainelIndexCache();
const linhasAvulso = getRelatorioLancamentosEmAbertoResponsavel(comAvulso, COOP);
const pagarAvulso = pickResumoStaffFichaPagar({
  data: comAvulso,
  cooperadoId: "c-1",
  cooperativaId: COOP,
  mesesPendentesPagamento: [MES],
  resumoPagamentoConsolidado: null,
  financeiroAberto: null,
  mesAtivo: MES,
  fluxoReciboAssinatura: false,
});
assert.equal(linhasAvulso[0]?.total, 85, "débito avulso entra no Em aberto");
assert.equal(pagarAvulso?.valorLiquido, 85, "Pagar usa o mesmo líquido com avulso");

console.log("ok: Em aberto e Pagar usam o mesmo valor");
