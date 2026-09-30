/**
 * Invariantes E2E: cooperado ↔ responsável ↔ HB (cenários sintéticos em massa).
 * Uso: npm run test:e2e-alignment
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida, NotaPedido } from "../src/types/index.ts";
import {
  alinharSomaFichasComNota,
  alinharFichaUnicaComNota,
  buildFichaFromNota,
  calcularItensNota,
  fichasValoresAlinhadosComNota,
  getResumoValorAPagarRelatorio,
  getTotalAPagarCooperado,
  reconciliarFichaFromNotasConferidas,
  registrarPagamentoCooperado,
} from "../src/services/notaPedidoService.ts";
import {
  getValorQuantoVouReceber,
  listarMesesPendentesPagamentoResponsavel,
  listarMesesPendentesQuantoVouReceber,
} from "../src/services/cooperadoEntregasService.ts";
import {
  calcLimiteFromPercentual,
  getCreditoBaseCooperadoCents,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { clampCreditosBaseToAuthoritative } from "../src/modules/hb-credit/engine/creditBaseValidation.ts";
import { round2 } from "../src/utils/calculations.ts";

const COOP = "coop-inv";
const COOPERADO = "c_main";
const COOPERADO_ALT = "c_alt_same_cpf";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    return;
  }
  passed++;
}

function baseData(overrides?: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado A",
        cpf: "11111111111",
        status: "ativo",
        createdAt: "",
      },
      {
        id: COOPERADO_ALT,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado A",
        cpf: "11111111111",
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
    instituicoes: [{ id: "inst-1", nome: "Escola", cooperativaId: COOP, ativo: true, createdAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
    ...overrides,
  } as AppData;
}

function nota(
  id: string,
  bruto: number,
  status: NotaPedido["status"],
  mes = "2026-09",
  cooperadoId = COOPERADO
): NotaPedido {
  const calc = calcularItensNota(
    [{ produtoId: "p1", produtoNome: "Item", unidade: "kg", quantidade: 1, precoUnitario: bruto, valorBruto: bruto }],
    5
  );
  return {
    id,
    cooperadoId,
    cooperativaId: COOP,
    mesReferencia: mes,
    status,
    valorBruto: calc.valorBruto,
    valorDesconto: calc.valorDesconto,
    valorLiquido: calc.valorLiquido,
    percentualDescontoCooperativa: 5,
    instituicaoId: "inst-1",
    itens: calc.itens,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function assertParidadeCooperadoResponsavel(data: AppData, mes: string, label: string) {
  const vCoop = getResumoValorAPagarRelatorio(data, COOPERADO, mes, COOP).valorLiquido;
  const vResp = getResumoValorAPagarRelatorio(data, COOPERADO, mes, COOP).valorLiquido;
  ok(`${label}: valor cooperado = responsável`, Math.abs(vCoop - vResp) <= 0.02, `${vCoop} vs ${vResp}`);
}

// --- Matriz: vários valores de nota conferida ---
for (const bruto of [12.5, 49.99, 100, 333.33, 169.24, 4135.78, 1992.3]) {
  const n = nota(`n_${bruto}`, bruto, "conferida");
  let data = reconciliarFichaFromNotasConferidas(
    baseData({ notasPedido: [n], fichaCorrida: [] })
  );
  ok(`reconcile bruto ${bruto}: ficha existe`, data.fichaCorrida.some((f) => f.notaPedidoId === n.id));
  ok(
    `reconcile bruto ${bruto}: nota×ficha`,
    fichasValoresAlinhadosComNota(data.fichaCorrida, n)
  );
  assertParidadeCooperadoResponsavel(data, "2026-09", `bruto ${bruto}`);
  const total = getTotalAPagarCooperado(data, COOPERADO, "2026-09", COOP);
  ok(`bruto ${bruto}: total a pagar > 0`, total > 0);
}

// --- Pagamento zera a receber; HB base zera ---
{
  const n = nota("n_pay", 200, "conferida");
  let data = reconciliarFichaFromNotasConferidas(baseData({ notasPedido: [n] }));
  assertParidadeCooperadoResponsavel(data, "2026-09", "antes pagamento");
  data = registrarPagamentoCooperado(data, COOPERADO, "2026-09", "Resp");
  const v = getValorQuantoVouReceber(data, COOPERADO, "2026-09", COOP).valor;
  ok("após PIX: a receber = 0", v === 0);
  ok("após PIX: HB base = 0", getCreditoBaseCooperadoCents(data, COOPERADO, COOP) === 0);
  const resp = getResumoValorAPagarRelatorio(data, COOPERADO, "2026-09", COOP).valorLiquido;
  ok("após PIX: responsável a pagar = 0", resp === 0);
}

// --- HB nunca acima do valor a receber (clamp servidor) ---
{
  const auth = { [COOPERADO]: 10_000 };
  const { sanitized, clamped } = clampCreditosBaseToAuthoritative(
    { [COOPERADO]: 50_000 },
    auth,
    [COOPERADO]
  );
  ok("clamp HB: reduz inflado", sanitized[COOPERADO] === 10_000 && clamped.length === 1);
  const lim = calcLimiteFromPercentual(sanitized[COOPERADO], 70);
  ok("limite HB ≤ base", lim <= sanitized[COOPERADO]);
}

// --- Multi-ficha: centavos na última fatia ---
{
  const n = nota("n_multi", 100, "conferida");
  const f1 = buildFichaFromNota(n, baseData(), "Resp");
  const f2: FichaCorrida = {
    ...f1,
    id: "f2",
    valorBruto: 49.99,
    descontos: round2(49.99 * 0.05),
    valorLiquido: round2(49.99 * 0.95),
  };
  f1.valorBruto = 50;
  f1.descontos = 2.5;
  f1.valorLiquido = 47.5;
  let fichas = [f1, f2];
  fichas = alinharSomaFichasComNota(fichas, n);
  ok("multi-ficha centavos", fichasValoresAlinhadosComNota(fichas, n));
}

// --- Ficha única centavo de bruto ---
{
  const n = nota("n_cent", 169.24, "conferida");
  const f = buildFichaFromNota(n, baseData(), "Resp");
  f.valorBruto = 169.23;
  f.valorLiquido = n.valorLiquido;
  const fixed = alinharFichaUnicaComNota([f], n);
  ok("ficha única centavo bruto", fichasValoresAlinhadosComNota(fixed, n));
}

// --- Consolidado responsável = soma meses cooperado ---
{
  const n1 = nota("n_m1", 80, "conferida", "2026-08");
  const n2 = nota("n_m2", 120, "conferida", "2026-09");
  const data = reconciliarFichaFromNotasConferidas(
    baseData({ notasPedido: [n1, n2] })
  );
  const meses = listarMesesPendentesQuantoVouReceber(data, COOPERADO, COOP);
  const mesesPag = listarMesesPendentesPagamentoResponsavel(data, COOPERADO, COOP);
  ok("meses pendentes iguais", mesesPag.join(",") === meses.join(","));
  let somaPorMes = 0;
  for (const m of meses) {
    somaPorMes += getResumoValorAPagarRelatorio(data, COOPERADO, m, COOP).valorLiquido;
  }
  const card = getValorQuantoVouReceber(data, COOPERADO, COOP);
  ok("card cooperado = soma resumos por mês", Math.abs(card.valor - somaPorMes) <= 0.02, `${card.valor} vs ${somaPorMes}`);
  const totalAdmin = getTotalAPagarCooperado(data, COOPERADO, undefined, COOP);
  ok("painel responsável = card cooperado", Math.abs(totalAdmin - card.valor) <= 0.02, `${totalAdmin} vs ${card.valor}`);
}

console.log(`\nInvariantes E2E: ${passed} OK, ${failed} falha(s).`);
if (failed > 0) process.exit(1);
console.log("OK — cooperado/responsável/HB alinhados nos cenários sintéticos.");
