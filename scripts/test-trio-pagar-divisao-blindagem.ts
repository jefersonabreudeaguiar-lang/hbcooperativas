/**
 * Blindagem: divisão inferida das fichas + Pagar após PIX aguardando (escopo explícito).
 * npx tsx scripts/test-trio-pagar-divisao-blindagem.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  inferirDivisaoEntregaDasFichas,
  reconciliarFichaFromNotasConferidas,
  fichasDivisaoEntregaConsistentes,
  getResumoValorAPagarRelatorio,
  getTotalAPagarCooperado,
  buildFichasDivisaoFromNota,
  criarDivisaoEntregaFromParticipantes,
} from "../src/services/notaPedidoService.ts";
import { cooperadoPendentePagamentoResponsavel } from "../src/services/cooperadoEntregasService.ts";

const COOP = "coop-trio";

function coop(id: string, nome: string) {
  return {
    id,
    cooperativaId: COOP,
    nomeCompleto: nome,
    cpfCnpj: id,
    status: "ativo" as const,
    createdAt: "",
    updatedAt: "",
  };
}

function baseData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [coop("ivan", "Ivan Arruda"), coop("cleber", "Cleber"), coop("cleito", "Cleito")],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "Escola", createdAt: "", updatedAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

function notaBase(): NotaPedido {
  return {
    id: "np_div",
    cooperativaId: COOP,
    cooperadoId: "ivan",
    cooperadoNomeSnapshot: "Ivan Arruda",
    instituicaoId: "i1",
    numeroNota: "99",
    dataEntrega: "2026-09-15",
    mesReferencia: "2026-09",
    status: "conferida",
    conferidaPor: "Resp",
    dataConferencia: "2026-09-16",
    itens: [
      {
        produtoInstituicaoId: "p1",
        produtoNome: "Alface",
        unidade: "un",
        precoUnitario: 10,
        quantidade: 9,
        valorBruto: 90,
      },
    ],
    valorBruto: 90,
    valorDesconto: 4.5,
    valorLiquido: 85.5,
    percentualDescontoCooperativa: 5,
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-16T10:00:00.000Z",
  };
}

function pagamentoAguardandoAgosto(fichaIds: string[], notaIds: string[]): PagamentoCooperadoRegistro {
  return {
    id: "pg_aug",
    cooperativaId: COOP,
    cooperadoId: "cleito",
    mesReferencia: "2026-08",
    mesesReferencia: ["2026-08", "2026-09"],
    status: "aguardando_confirmacao",
    valorLiquido: 1000,
    fichaIds,
    notaPedidoIds: notaIds,
    pagoEm: "2026-08-28T12:00:00.000Z",
    createdAt: "2026-08-28T12:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
  };
}

// --- inferir divisão + rebuild multi-foto ---
{
  let data = baseData();
  const nota = notaBase();
  const divisao = criarDivisaoEntregaFromParticipantes(data, COOP, "ivan", "Ivan Arruda", [
    "ivan",
    "cleber",
    "cleito",
  ])!;
  let fichas: FichaCorrida[] = [];
  for (let foto = 0; foto < 2; foto++) {
    fichas = [
      ...fichas,
      ...buildFichasDivisaoFromNota(data, nota, "Resp", divisao, fichas, {
        fotoIndex: foto,
        totalFotos: 2,
      }),
    ];
  }
  data = { ...data, notasPedido: [nota], fichaCorrida: fichas };
  const inferred = inferirDivisaoEntregaDasFichas(data, nota);
  assert.equal(inferred?.participantes.length, 3);
  const reconciled = reconciliarFichaFromNotasConferidas(data);
  const notaFix = reconciled.notasPedido.find((n) => n.id === nota.id)!;
  assert.equal(notaFix.divisaoEntrega?.participantes.length, 3);
  assert.ok(
    fichasDivisaoEntregaConsistentes(reconciled, reconciled.fichaCorrida, notaFix),
    "divisão multi-foto inconsistente após reconciliar"
  );
}

// --- Pagar setembro com PIX aguardando só agosto ---
{
  let data = baseData();
  const fichaSet = {
    id: "fc_sep",
    cooperativaId: COOP,
    cooperadoId: "cleito",
    notaPedidoId: "np_sep",
    mesReferencia: "2026-09",
    descricao: "Entrega set",
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    saldoAcumulado: 100,
    status: "pendente" as const,
    itens: [],
    createdAt: "",
    updatedAt: "",
  };
  const notaSep: NotaPedido = {
    ...notaBase(),
    id: "np_sep",
    mesReferencia: "2026-09",
    dataEntrega: "2026-09-10",
    valorLiquido: 100,
    valorBruto: 100,
    valorDesconto: 0,
  };
  data = {
    ...data,
    notasPedido: [notaSep],
    fichaCorrida: [fichaSet],
    pagamentosCooperado: [
      pagamentoAguardandoAgosto(["fc_aug"], ["np_aug"]),
    ],
  };
  const resumo = getResumoValorAPagarRelatorio(data, "cleito", "2026-09", COOP);
  assert.equal(resumo.valorLiquido, 100, "setembro deve aparecer fora do escopo do PIX de agosto");
  assert.ok(cooperadoPendentePagamentoResponsavel(data, "cleito", undefined, COOP));
  assert.equal(getTotalAPagarCooperado(data, "cleito", "2026-09", COOP), 100);
}

console.log("test-trio-pagar-divisao-blindagem: OK");
