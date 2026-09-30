/**
 * Testes unitários — HB Créditos ↔ impacto no A receber (sem DB).
 * npx tsx scripts/test-hb-utilizacao-resumo.ts
 */
import assert from "node:assert/strict";
import {
  enriquecerSaldosHbUtilizacao,
  impactoAReceberReais,
  saldoAReceberBaseAntesHb,
  valorReaisLinhaResumoCooperado,
} from "../src/lib/hb-credit/utilizacaoResumo.ts";

{
  const tx = {
    event_type: "PAYMENT",
    status: "posted",
    amount_cents: 10000,
    gross_amount_cents: 10000,
    credit_debited_cents: 9000,
  };
  assert.equal(valorReaisLinhaResumoCooperado(tx), 90);
  assert.equal(impactoAReceberReais(tx), -90);
}

{
  const compra = {
    event_type: "PAYMENT",
    status: "reversed",
    amount_cents: 10000,
    gross_amount_cents: 10000,
  };
  const estorno = { event_type: "REFUND", status: "posted", amount_cents: 10000 };
  assert.equal(impactoAReceberReais(compra), -100);
  assert.equal(impactoAReceberReais(estorno), 100);
  assert.equal(impactoAReceberReais(compra) + impactoAReceberReais(estorno), 0);
}

{
  const base = saldoAReceberBaseAntesHb(233.32, [
    { tipo: "mensalidade", motivo: "Mens", valor: 30 },
    { tipo: "conta_coop", motivo: "Compra HB", valor: 79.9 },
  ]);
  assert.equal(base, 203.32);
}

{
  const lancamentos = enriquecerSaldosHbUtilizacao(
    [
      {
        hbTransactionId: "t1",
        cooperadoId: "c1",
        partnerId: "p1",
        partnerNome: "Mercado",
        eventType: "PAYMENT",
        transactionStatus: "posted",
        statusResumo: "CONFIRMED",
        createdAt: "2026-09-01T12:00:00Z",
        valorCompraReais: 100,
        valorDescontoReais: 0,
        valorFinalCompraReais: 100,
        valorHbUtilizadoReais: 100,
        valorImpactoAReceberReais: -100,
      },
    ],
    1000
  );
  assert.equal(lancamentos[0]?.saldoAReceberAnteriorReais, 1000);
  assert.equal(lancamentos[0]?.saldoAReceberPosteriorReais, 900);
}

{
  const tx = {
    event_type: "PAYMENT",
    status: "posted",
    amount_cents: 10000,
    credit_debited_cents: 9000,
  };
  const impacto1 = impactoAReceberReais(tx);
  const impacto2 = impactoAReceberReais(tx);
  assert.equal(impacto1, impacto2);
}

console.log("OK — test-hb-utilizacao-resumo");
