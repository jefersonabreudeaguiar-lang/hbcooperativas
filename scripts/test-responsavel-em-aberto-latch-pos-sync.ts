/**
 * Em aberto não reaproveita latch após PIX/sync (paridade R3 com Pagar e Início).
 * npx tsx scripts/test-responsavel-em-aberto-latch-pos-sync.ts
 */
import assert from "node:assert/strict";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { getTotalValoresAPagarGestaoCooperativa } from "../src/lib/responsavel/responsavelGestaoLeitura.ts";
import { expandStaffTierPlanIfOperacionalVazio } from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";
import { emptyInitialData } from "../src/mock/data.ts";

const COOP = "coop-latch";
const MES = "2026-10";

function base(): AppData {
  return {
    ...emptyInitialData,
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" } as never],
    cooperados: [
      {
        id: "c-1",
        nomeCompleto: "Ana",
        cooperativaId: COOP,
        status: "ativo",
        chavePix: "ana@pix",
      } as never,
    ],
    notasPedido: [
      {
        id: "n-1",
        cooperativaId: COOP,
        cooperadoId: "c-1",
        mesReferencia: MES,
        status: "conferida",
        valorBruto: 100,
        valorLiquido: 95,
        createdAt: "2026-10-01T00:00:00.000Z",
      } as never,
    ],
    fichaCorrida: [],
    pagamentosCooperado: [],
  } as AppData;
}

resetResponsavelPainelIndexCache();
const aberto1 = getRelatorioLancamentosEmAbertoResponsavel(base(), COOP);
assert.equal(aberto1.length, 1);
assert.ok(aberto1[0].total > 0);

const comPix: AppData = {
  ...base(),
  pagamentosCooperado: [
    {
      id: "pix-1",
      cooperativaId: COOP,
      cooperadoId: "c-1",
      mesReferencia: MES,
      valorBruto: 100,
      descontoCooperativa: 5,
      descontosExtras: [],
      valorLiquido: 95,
      fichaIds: [],
      notaPedidoIds: ["n-1"],
      status: "confirmado",
      pagoPor: "resp",
      pagoEm: "2026-10-20T12:00:00.000Z",
      createdAt: "2026-10-20T12:00:00.000Z",
    } as PagamentoCooperadoRegistro,
  ],
};

const aberto2 = getRelatorioLancamentosEmAbertoResponsavel(comPix, COOP);
assert.equal(aberto2.length, 0, "latch não mantém cooperado após PIX");
assert.equal(getTotalValoresAPagarGestaoCooperativa(comPix, COOP), 0);

const comPixLocal = {
  ...emptyInitialData,
  pagamentosCooperado: [{ id: "p1", cooperativaId: COOP, status: "confirmado" } as never],
  livroCaixa: [{ id: "l1", cooperativaId: COOP } as never],
};
const planAtualizar = expandStaffTierPlanIfOperacionalVazio(
  resolveSyncTierPlan84("operacional_full", "staff"),
  comPixLocal,
  COOP,
  { staffUserInitiated: true }
);
assert.equal(planAtualizar.pullOperacional, true, "Atualizar sempre puxa operacional");

console.log("OK test-responsavel-em-aberto-latch-pos-sync");
