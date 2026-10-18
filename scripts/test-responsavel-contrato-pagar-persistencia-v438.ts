/**
 * v438 — Contratos e Pagar não retrocedem no sync.
 * Uso: npx tsx scripts/test-responsavel-contrato-pagar-persistencia-v438.ts
 */
import assert from "node:assert/strict";
import type { AppData, Instituicao, ProdutoInstituicao, User } from "../src/types/index.ts";
import { resolveGestaoCooperativaId } from "../src/utils/cooperativa.ts";
import { getInstituicoesCatalogo } from "../src/services/catalogoContratosService.ts";
import { alinharCatalogoComNuvem, mergeContratosIntoData } from "../src/services/cooperativaSyncCloudService.ts";
import { listarMesesEmAbertoPagamentoResponsavel } from "../src/services/cooperadoEntregasService.ts";
import {
  applyPagarSlice,
  extractPagarSlice,
  pagarRegrediu,
  reaplicarAbaLastGoodSeRegrediu,
} from "../src/lib/responsavel/abaLastGoodCheckpoint.ts";

const COOP = "coop-1";

function emptyData(users: User[] = []): AppData {
  return {
    users,
    cooperativas: [{ id: COOP, nome: "Coop Test", cnpj: "12345678000199", active: true }],
    cooperados: [],
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
    fechamentosMensais: [],
    arquivosMensais: [],
    livroCaixa: [],
  } as AppData;
}

const instLocal: Instituicao = {
  id: "i-local",
  cooperativaId: COOP,
  nome: "PNAE Merenda",
  tipo: "PNAE",
  cnpj: "",
  responsavel: "",
  telefone: "",
  endereco: "",
  totalComprado: 0,
  createdAt: "2026-10-17T12:00:00.000Z",
  updatedAt: "2026-10-17T16:00:00.000Z",
};

const prodLocal: ProdutoInstituicao = {
  id: "pi-local",
  cooperativaId: COOP,
  instituicaoId: "i-local",
  nome: "Alface",
  unidade: "kg",
  precoUnitario: 4.5,
  ativo: true,
  createdAt: "2026-10-17T12:00:00.000Z",
  updatedAt: "2026-10-17T16:00:00.000Z",
};

const instCloudVelha: Instituicao = {
  ...instLocal,
  id: "i-cloud",
  nome: "Contrato antigo",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const prodCloudVelho: ProdutoInstituicao = {
  ...prodLocal,
  id: "pi-cloud",
  instituicaoId: "i-cloud",
  nome: "Tomate",
  precoUnitario: 3,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

{
  const staff = {
    id: "u-resp",
    email: "resp@coop.test",
    name: "Responsável",
    password: "x",
    role: "responsavel",
    cooperativaId: undefined,
    cooperativaCnpj: "12.345.678/0001-99",
    active: true,
  } as User;
  const data = emptyData([staff]);
  data.instituicoes = [instLocal];
  data.produtosInstituicao = [prodLocal];
  const coopId = resolveGestaoCooperativaId(staff, data);
  assert.equal(coopId, COOP, "staff só com CNPJ resolve a cooperativa");
  assert.equal(getInstituicoesCatalogo(data, coopId).length, 1, "Contratos lista a instituição da coop");
}

{
  const alinhado = alinharCatalogoComNuvem(
    [instLocal, instCloudVelha],
    [prodLocal, prodCloudVelho],
    [instCloudVelha],
    [prodCloudVelho],
    COOP
  );
  assert.ok(
    alinhado.instituicoes.some((i) => i.id === "i-local"),
    "instituição local mais nova não some no pull"
  );
  const alface = alinhado.produtos.find((p) => p.id === "pi-local");
  assert.equal(alface?.ativo, true, "preço local publicado mais novo permanece ativo");
}

{
  const data = emptyData();
  data.instituicoes = [instLocal];
  data.produtosInstituicao = [prodLocal];
  const merged = mergeContratosIntoData(
    data,
    {
      updatedAt: "2026-09-01T00:00:00.000Z",
      instituicoes: [instCloudVelha],
      produtosInstituicao: [prodCloudVelho],
    },
    COOP
  );
  assert.ok(
    merged.instituicoes.some((i) => i.id === "i-local"),
    "merge da nuvem não apaga contrato local mais novo"
  );
  assert.ok(
    merged.produtosInstituicao.some((p) => p.id === "pi-local" && p.ativo && p.precoUnitario > 0),
    "merge da nuvem não desativa preço local publicado"
  );
}

{
  const mesPago = "2026-07";
  const mesNovo = "2026-10";
  const data = emptyData();
  data.cooperados = [
    {
      id: "coop-member-1",
      nomeCompleto: "Pago",
      cooperativaId: COOP,
      status: "ativo",
      chavePix: "pix@test",
    } as AppData["cooperados"][0],
  ];
  data.pagamentosCooperado = [
    {
      id: "pg-ok",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mesPago,
      status: "confirmado",
      valorLiquido: 100,
      valorBruto: 110,
      descontoCooperativa: 10,
      descontosExtras: [],
      fichaIds: ["f-pago"],
      notaPedidoIds: ["n-pago"],
      pagoPor: "resp",
      pagoEm: "2026-07-12T00:00:00.000Z",
      createdAt: "2026-07-12T00:00:00.000Z",
    },
  ];
  data.fichaCorrida = [
    {
      id: "f-pago",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mesPago,
      notaPedidoId: "n-pago",
      status: "pago",
      valorBruto: 110,
      valorLiquido: 100,
      descontos: 10,
      saldoAcumulado: 0,
      descricao: "pago",
      dataLancamento: "2026-07-01T00:00:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
  ];
  const lastGood = extractPagarSlice(data, COOP);
  const puxado = {
    ...data,
    pagamentosCooperado: [],
    fichaCorrida: data.fichaCorrida.map((f) => ({ ...f, status: "pendente" as const })),
  };
  assert.equal(pagarRegrediu(extractPagarSlice(puxado, COOP), lastGood), true);
  const restaurado = reaplicarAbaLastGoodSeRegrediu(puxado, COOP, "pagar", lastGood);
  assert.equal(
    restaurado.pagamentosCooperado.some((p) => p.id === "pg-ok" && p.status === "confirmado"),
    true,
    "PIX confirmado volta se o pull o apagou"
  );
  const abertos = listarMesesEmAbertoPagamentoResponsavel(restaurado, "coop-member-1", COOP);
  assert.equal(abertos.includes(mesPago), false, "mês pago restaurado não volta para Pagar");

  const comNovo = applyPagarSlice(restaurado, COOP, lastGood);
  comNovo.fichaCorrida = [
    ...comNovo.fichaCorrida,
    {
      id: "f-novo",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mesNovo,
      notaPedidoId: "n-novo",
      status: "pendente",
      valorBruto: 50,
      valorLiquido: 45,
      descontos: 5,
      saldoAcumulado: 0,
      descricao: "novo",
      dataLancamento: "2026-10-16T00:00:00.000Z",
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    },
  ];
  comNovo.notasPedido = [
    {
      id: "n-novo",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mesNovo,
      status: "conferida",
      valorLiquido: 45,
      itens: [],
      createdAt: "2026-10-16T00:00:00.000Z",
      dataEntrega: "2026-10-16",
    } as AppData["notasPedido"][0],
  ];
  const abertosNovo = listarMesesEmAbertoPagamentoResponsavel(comNovo, "coop-member-1", COOP);
  assert.equal(abertosNovo.includes(mesNovo), true, "lançamento recente sem PIX permanece em aberto");

  const lastGoodPago = extractPagarSlice(data, COOP);
  const fichaRebaixada: AppData = {
    ...data,
    fichaCorrida: data.fichaCorrida.map((f) => ({
      ...f,
      status: "pendente" as const,
      updatedAt: "2026-10-18T08:00:00.000Z",
    })),
  };
  const naoRebaixa = applyPagarSlice(fichaRebaixada, COOP, lastGoodPago);
  assert.equal(
    naoRebaixa.fichaCorrida.find((f) => f.id === "f-pago")?.status,
    "pago",
    "checkpoint pendente mais novo não devolve o pago para em aberto"
  );
}

console.log("test-responsavel-contrato-pagar-persistencia-v438: OK");
