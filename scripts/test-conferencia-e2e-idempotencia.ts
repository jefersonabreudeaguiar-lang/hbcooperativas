/**
 * E2E sintético: nota conferida → 1 ficha → A receber → idempotência (retry/reconciliar).
 * npx tsx scripts/test-conferencia-e2e-idempotencia.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";
import {
  buildFichaFromNota,
  calcularItensNota,
  dedupeFichaCorridaPorNota,
  fichasValoresAlinhadosComNota,
  getResumoPagamentoCooperado,
  idEstavelFichaCorrida,
  rebuildFichasNota,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService.ts";
import { getCreditoBaseCooperadoCents } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";

const COOP = "coop-e2e";
const COOP_ID = "c1";
const NOTA_ID = "nota-e2e-1";

function base(): AppData {
  const bruto = 100;
  const calc = calcularItensNota(
    [{ produtoId: "p1", produtoNome: "Tomate", unidade: "kg", quantidade: 10, precoUnitario: 10, valorBruto: bruto }],
    5
  );
  const nota: NotaPedido = {
    id: NOTA_ID,
    cooperadoId: COOP_ID,
    cooperativaId: COOP,
    mesReferencia: "2026-09",
    numeroNota: "NF-100",
    status: "conferida",
    conferidaPor: "Responsável Teste",
    dataConferencia: "2026-09-15",
    valorBruto: calc.valorBruto,
    valorDesconto: calc.valorDesconto,
    valorLiquido: calc.valorLiquido,
    percentualDescontoCooperativa: 5,
    instituicaoId: "inst-1",
    itens: calc.itens,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOP_ID,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado E2E",
        cpf: "12345678901",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [nota],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", nome: "Escola", cooperativaId: COOP, ativo: true, createdAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("PASS:", msg);
  }
}

const nota = base().notasPedido[0]!;

ok(
  idEstavelFichaCorrida(NOTA_ID, COOP_ID) === idEstavelFichaCorrida(NOTA_ID, COOP_ID),
  "id estável repetível"
);

let data = base();
const lanc1 = rebuildFichasNota(data, nota);
data = { ...data, ...lanc1, notasPedido: data.notasPedido };
const fichas1 = data.fichaCorrida.filter((f) => f.notaPedidoId === NOTA_ID);
ok(fichas1.length === 1, "primeiro lançamento: exatamente 1 ficha");
ok(fichas1[0]!.cooperadoId === COOP_ID, "ficha cooperadoId");
ok(fichas1[0]!.valorLiquido === nota.valorLiquido, "ficha valor líquido = nota");
ok(fichasValoresAlinhadosComNota(data.fichaCorrida, nota), "nota×ficha alinhados");

const lanc2 = rebuildFichasNota(data, nota);
data = { ...data, ...lanc2 };
const fichas2 = data.fichaCorrida.filter((f) => f.notaPedidoId === NOTA_ID);
ok(fichas2.length === 1, "segundo rebuild: ainda 1 ficha");
ok(fichas2[0]!.id === fichas1[0]!.id, "retry preserva id da ficha");

const dupLegacy: FichaCorrida = {
  ...fichas2[0]!,
  id: `fc_${Date.now()}_legacy`,
  valorLiquido: nota.valorLiquido,
};
data = {
  ...data,
  fichaCorrida: [...data.fichaCorrida, dupLegacy],
};
data = reconciliarFichaFromNotasConferidas(data);
const fichas3 = data.fichaCorrida.filter((f) => f.notaPedidoId === NOTA_ID);
ok(fichas3.length === 1, "reconciliar remove duplicata legacy");
ok(fichasValoresAlinhadosComNota(data.fichaCorrida, nota), "reconciliar mantém alinhamento");

const resumo = getResumoPagamentoCooperado(data, COOP_ID, "2026-09", COOP);
ok(Math.abs(resumo.valorLiquido - nota.valorLiquido) < 0.02, "A receber valor líquido");
const exib = getValorQuantoVouReceber(data, COOP_ID, "2026-09", COOP).valor;
ok(Math.abs(exib - nota.valorLiquido) < 0.02, "cooperado visualiza valor correto");
const hbBase = getCreditoBaseCooperadoCents(data, COOP_ID, COOP);
ok(hbBase > 0, "base HB Crédito > 0 com ficha em aberto");

data = reconciliarFichaFromNotasConferidas(data);
data = reconciliarFichaFromNotasConferidas(data);
ok(
  data.fichaCorrida.filter((f) => f.notaPedidoId === NOTA_ID).length === 1,
  "double reconciliar idempotente"
);

const orphan = buildFichaFromNota(nota, data, "Resp", "Cooperado E2E");
data = {
  ...data,
  fichaCorrida: dedupeFichaCorridaPorNota([...data.fichaCorrida, orphan], data.notasPedido),
};
ok(
  data.fichaCorrida.filter((f) => f.notaPedidoId === NOTA_ID).length === 1,
  "dedupe após buildFichaFromNota acidental"
);

if (failed > 0) {
  console.error(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log("\ntest-conferencia-e2e-idempotencia: ok");
