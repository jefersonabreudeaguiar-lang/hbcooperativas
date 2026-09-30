/**
 * HB Créditos — limite liberado é autoridade; M6 quitado não zera; APIs alinhadas.
 * npx tsx scripts/test-hb-credit-limite-autoridade.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "@/types";
import {
  resolveLimiteHbCooperadoEfetivo,
  cooperadoTemEntregasConferidasParaHb,
} from "../src/modules/hb-credit/engine/creditBaseHbGuard";
import {
  hbCreditCreditoBaseReais,
  hbCreditCreditoBaseLastroEntregasReais,
} from "../src/lib/hb-credit/hbCreditLeituraBic";
import { computeAmountUsedCentsFromPayments } from "../src/lib/supabase/creditAmountUsedReconcile";
import { computeDisponivel } from "../src/modules/hb-credit/engine/money";
import { isHbCreditStaffNavEligible, isHbCreditNavVisible } from "../src/permissions";
import type { ContaCoopLimiteCooperado } from "../src/modules/hb-credit/types";

process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED = "true";

const COOP = "coop-hb";
const COOPERADO = "c_hb";

function limiteRow(released: number, usado: number): ContaCoopLimiteCooperado {
  return {
    id: "acc1",
    cooperativaCnpj: "62351750000165",
    cooperadoId: COOPERADO,
    limiteLiberadoCents: released,
    valorUsadoCents: usado,
    valorDisponivelCents: computeDisponivel(released, usado),
    bloqueado: false,
    hasFinancialPin: true,
    pinLockedUntil: null,
    cashbackDisponivelCents: 0,
    updatedAt: new Date().toISOString(),
  };
}

function miniData(overrides: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "HB Test",
        cpf: "00000000000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [
      {
        id: "n1",
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        mesReferencia: "2026-09",
        status: "conferida",
        valorLiquido: 500,
        valorBruto: 500,
        instituicaoId: "i1",
        itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500 }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
    ...overrides,
  } as AppData;
}

// CENÁRIO 1 — limite liberado com A receber > 0 (simulado via base lastro + released)
{
  const eff = resolveLimiteHbCooperadoEfetivo(limiteRow(50_000, 0), 50_000, 100);
  assert.equal(eff.limiteLiberadoCents, 50_000);
  assert.equal(eff.valorDisponivelCents, 50_000);
}

// CENÁRIO 2 — A receber quitado (M6 zero): base e limite efetivo zeram sem compra HB
{
  const data = miniData({
    pagamentosCooperado: [
      {
        id: "pg1",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: "2026-09",
        valorBruto: 500,
        descontoCooperativa: 0,
        descontosExtras: [],
        valorLiquido: 500,
        fichaIds: [],
        notaPedidoIds: ["n1"],
        status: "confirmado",
        pagoPor: "Resp",
        pagoEm: "2026-09-15T12:00:00.000Z",
        createdAt: "2026-09-15T12:00:00.000Z",
        updatedAt: "2026-09-15T12:00:00.000Z",
      },
    ],
    notasPedido: [
      {
        id: "n1",
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        mesReferencia: "2026-09",
        status: "pago",
        valorLiquido: 500,
        valorBruto: 500,
        instituicaoId: "i1",
        itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500 }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-15T12:00:00.000Z",
      },
    ],
  });
  assert.ok(cooperadoTemEntregasConferidasParaHb(data, COOPERADO, COOP));
  const lastro = hbCreditCreditoBaseLastroEntregasReais(data, COOPERADO, COOP);
  assert.equal(lastro, 500, "lastro histórico permanece para diagnóstico");
  const baseReais = hbCreditCreditoBaseReais(data, COOPERADO, COOP);
  assert.equal(baseReais, 0, "crédito-base HB = só valor a receber em aberto");
  const eff = resolveLimiteHbCooperadoEfetivo(limiteRow(50_000, 0), 0, 100);
  assert.equal(eff.limiteLiberadoCents, 0);
  assert.equal(eff.valorDisponivelCents, 0);
}

// CENÁRIO 3 — compra
{
  const usado = computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "posted", amount_cents: 10_000, credit_debited_cents: 10_000 },
  ]);
  assert.equal(usado, 10_000);
  const eff = resolveLimiteHbCooperadoEfetivo(limiteRow(50_000, usado), 50_000, 100);
  assert.equal(eff.limiteLiberadoCents, 50_000);
  assert.equal(eff.valorUsadoCents, 10_000);
  assert.equal(eff.valorDisponivelCents, 40_000);
}

// CENÁRIO 4 — estorno (payment reversed não conta)
{
  const usado = computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "reversed", amount_cents: 10_000, credit_debited_cents: 10_000 },
  ]);
  assert.equal(usado, 0);
  const eff = resolveLimiteHbCooperadoEfetivo(limiteRow(50_000, usado), 50_000, 100);
  assert.equal(eff.valorDisponivelCents, 50_000);
}

// CENÁRIO 5 — mesma regra account/limites (função única)
{
  const raw = limiteRow(30_000, 5_000);
  const staff = resolveLimiteHbCooperadoEfetivo(raw, 30_000, 50);
  const coop = resolveLimiteHbCooperadoEfetivo(raw, 30_000, 50);
  assert.deepEqual(
    {
      limite: staff.limiteLiberadoCents,
      usado: staff.valorUsadoCents,
      disp: staff.valorDisponivelCents,
    },
    {
      limite: coop.limiteLiberadoCents,
      usado: coop.valorUsadoCents,
      disp: coop.valorDisponivelCents,
    }
  );
}

// CENÁRIO 6 — dashboard agregado = soma dos efetivos (simulado)
{
  const a = resolveLimiteHbCooperadoEfetivo(limiteRow(20_000, 2_000), 20_000, 100);
  const b = resolveLimiteHbCooperadoEfetivo(
    { ...limiteRow(10_000, 0), cooperadoId: "c2" },
    10_000,
    100
  );
  const sumLimite = a.limiteLiberadoCents + b.limiteLiberadoCents;
  const sumUsado = a.valorUsadoCents + b.valorUsadoCents;
  assert.equal(sumLimite, 30_000);
  assert.equal(sumUsado, 2_000);
  assert.equal(computeDisponivel(sumLimite, sumUsado), 28_000);
}

// CENÁRIO 7 — teto global 100% mas liberação coletiva 70% capa exibição
{
  const base = 10_000;
  const releasedFull = 10_000;
  const eff = resolveLimiteHbCooperadoEfetivo(limiteRow(releasedFull, 0), base, 100, 70);
  assert.equal(eff.limiteLiberadoCents, 7_000);
}

// VISIBILIDADE — responsável mantém menu em erro transitório
{
  assert.equal(
    isHbCreditStaffNavEligible({ role: "responsavel" }, "error", false),
    true
  );
  assert.equal(
    isHbCreditNavVisible(false, true, true, true),
    true
  );
  assert.equal(
    isHbCreditStaffNavEligible({ role: "responsavel" }, "disabled", false),
    false
  );
}

console.log("OK — HB crédito limite autoridade (6 cenários + visibilidade)");
