/**
 * H8.9.117 — blindagem: uma transação HB = uma incidência no A receber.
 * npx tsx scripts/test-hb-dedupe-incidencia-h89117.ts
 */
import assert from "node:assert/strict";
import {
  dedupeIncidenciaHbDescontosContaCoop,
  type DescontoContaCoopRemoto,
} from "../src/lib/hb-credit/dedupeIncidenciaHbDesconto.ts";
import {
  dedupeDescontosContaCoopRemotos,
  liquidoUsoContaCoopMes,
  mergeDescontosContaCoopNoResumo,
} from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import { resolveDescontosContaCoopMesParaCalculo } from "../src/lib/hb-credit/contaCoopDescontosMemory.ts";
import { impactoAReceberReais } from "../src/lib/hb-credit/utilizacaoResumo.ts";
import type { AppData } from "../src/types/index.ts";

const TX_CACAU = "tx_1788290556674_3ed0c48acb39";
const TS_CACAU = "2026-09-01T19:22:36.725803+00:00";

function linha(partial: Partial<DescontoContaCoopRemoto> & Pick<DescontoContaCoopRemoto, "motivo" | "valorReais">): DescontoContaCoopRemoto {
  return {
    tipo: "conta_coop",
    createdAt: TS_CACAU,
    ...partial,
  };
}

// 1) uma transaction → uma linha
{
  const one = dedupeIncidenciaHbDescontosContaCoop([
    linha({
      hbTransactionId: TX_CACAU,
      motivo: "Compra HB Créditos — Casa do Cacau (009AEE5F)",
      valorReais: 79.9,
    }),
  ]);
  assert.equal(one.length, 1);
  assert.equal(one[0]?.valorReais, 79.9);
}

// 2) mesma transaction por dois caminhos (Conta Coop + HB Créditos) → uma linha
{
  const dup = dedupeDescontosContaCoopRemotos([
    linha({
      motivo: "Compra Conta Coop — Casa do Cacau (009AEE5F)",
      valorReais: 79.9,
    }),
    linha({
      hbTransactionId: TX_CACAU,
      motivo: "Compra HB Créditos — Casa do Cacau (009AEE5F)",
      valorReais: 79.9,
    }),
  ]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0]?.hbTransactionId, TX_CACAU);
  assert.equal(liquidoUsoContaCoopMes(dup), 79.9);
}

// 3) duas transactions diferentes, mesmo valor → duas linhas
{
  const two = dedupeDescontosContaCoopRemotos([
    linha({
      hbTransactionId: "tx_a",
      motivo: "Compra HB — Mercado A (AAA11111)",
      valorReais: 79.9,
      createdAt: "2026-09-01T10:00:00.000Z",
    }),
    linha({
      hbTransactionId: "tx_b",
      motivo: "Compra HB — Mercado B (BBB22222)",
      valorReais: 79.9,
      createdAt: "2026-09-01T11:00:00.000Z",
    }),
  ]);
  assert.equal(two.length, 2);
}

// 4) PAYMENT + REFUND → efeito líquido correto
{
  const tsPay = "2026-09-01T18:35:23.396685+00:00";
  const tsRef = "2026-09-01T18:41:54.581179+00:00";
  const lines = dedupeDescontosContaCoopRemotos([
    linha({
      hbTransactionId: "tx_pay_150",
      motivo: "Compra HB Créditos — Mercado teste (3079A7EA)",
      valorReais: 150,
      createdAt: tsPay,
    }),
    linha({
      hbTransactionId: "tx_ref_150",
      motivo: "Estorno HB Créditos — Mercado teste",
      valorReais: 150,
      createdAt: tsRef,
    }),
  ]);
  assert.equal(lines.length, 2);
  assert.equal(liquidoUsoContaCoopMes(lines), 0);
}

// 5) PAYMENT reversed (linha legada gross) + REFUND — líquido zero
{
  const lines = dedupeDescontosContaCoopRemotos([
    linha({
      hbTransactionId: "tx_rev",
      motivo: "Compra HB Créditos — Mercado teste (B221125C) (estornada)",
      valorReais: 100,
      createdAt: "2026-09-01T17:31:46.435938+00:00",
    }),
    linha({
      hbTransactionId: "tx_ref_100",
      motivo: "Estorno Conta Coop — Mercado teste",
      valorReais: 100,
      createdAt: "2026-09-01T18:00:24.459843+00:00",
    }),
  ]);
  assert.equal(liquidoUsoContaCoopMes(lines), 0);
}

// 6) CASHBACK_EARN não entra em descontos conta_coop — PAYMENT permanece
{
  const txPay = {
    event_type: "PAYMENT",
    status: "posted",
    amount_cents: 7990,
    credit_debited_cents: 7990,
  };
  assert.equal(impactoAReceberReais(txPay), -79.9);
  const cashbackOnly = dedupeDescontosContaCoopRemotos([
    linha({ hbTransactionId: TX_CACAU, motivo: "Compra HB — Casa (009AEE5F)", valorReais: 79.9 }),
  ]);
  assert.equal(liquidoUsoContaCoopMes(cashbackOnly), 79.9);
}

// 7) parceiros diferentes — não deduplicar (recibos distintos)
{
  const lines = dedupeDescontosContaCoopRemotos([
    linha({
      motivo: "Compra Conta Coop — Mercado A (REC001AA)",
      valorReais: 50,
      createdAt: "2026-09-02T12:00:00.000Z",
    }),
    linha({
      motivo: "Compra Conta Coop — Mercado B (REC002BB)",
      valorReais: 50,
      createdAt: "2026-09-02T12:00:00.000Z",
    }),
  ]);
  assert.equal(lines.length, 2);
}

// 8) legado sem hbTransactionId — fallback por recibo (colapsa com linha HB Créditos)
{
  const merged = dedupeDescontosContaCoopRemotos([
    linha({ motivo: "Compra Conta Coop — Casa do Cacau (009AEE5F)", valorReais: 79.9 }),
    linha({ motivo: "Compra HB Créditos — Casa do Cacau (009AEE5F)", valorReais: 79.9 }),
  ]);
  assert.equal(merged.length, 1);
}

// 9) Orlando / Casa do Cacau / 009AEE5F → exatamente R$ 79,90 no resumo
{
  const descontos = dedupeDescontosContaCoopRemotos([
    linha({ motivo: "Compra Conta Coop — Casa do Cacau (009AEE5F)", valorReais: 79.9 }),
    linha({
      hbTransactionId: TX_CACAU,
      motivo: "Compra HB Créditos — Casa do Cacau (009AEE5F)",
      valorReais: 79.9,
    }),
  ]);
  const resumoBase = {
    valorBruto: 233.32,
    descontoCooperativa: 12.28,
    descontosExtras: [{ tipo: "mensalidade" as const, motivo: "Mens", valor: 30 }],
    valorEntregas: 233.32,
    valorLiquido: 203.32,
    fichaIds: ["fc_x"],
    notaPedidoIds: ["np_x"],
  };
  const merged = mergeDescontosContaCoopNoResumo(resumoBase, descontos);
  const coopLines = merged.descontosExtras.filter((d) => d.tipo === "conta_coop");
  assert.equal(coopLines.length, 1);
  assert.equal(coopLines[0]?.valor, 79.9);
  assert.equal(merged.valorLiquido, 123.42);
}

// 10) nenhum efeito em pagamentosCooperado (dedupe só toca projeção HB)
{
  const pagamentos = [{ id: "pg_1", cooperadoId: "c1", mesReferencia: "2026-09", valorLiquido: 100 }] as AppData["pagamentosCooperado"];
  const data = { pagamentosCooperado: pagamentos } as AppData;
  dedupeDescontosContaCoopRemotos([
    linha({ hbTransactionId: TX_CACAU, motivo: "Compra HB", valorReais: 79.9 }),
    linha({ motivo: "Compra Conta Coop — Casa (009AEE5F)", valorReais: 79.9 }),
  ]);
  assert.equal(data.pagamentosCooperado, pagamentos);
  assert.equal(data.pagamentosCooperado[0]?.valorLiquido, 100);
}

// 11) nenhum efeito em fichas/notas (função pura)
{
  const ficha = { id: "fc_1", valorLiquido: 233.32 };
  dedupeIncidenciaHbDescontosContaCoop([linha({ motivo: "x", valorReais: 1 })]);
  assert.equal(ficha.valorLiquido, 233.32);
}

// 12) resolve arquivo + memória sem dobrar mesma tx
{
  const arquivo = [
    linha({ motivo: "Compra Conta Coop — Casa do Cacau (009AEE5F)", valorReais: 79.9 }),
  ];
  const memoria = [
    linha({
      hbTransactionId: TX_CACAU,
      motivo: "Compra HB Créditos — Casa do Cacau (009AEE5F)",
      valorReais: 79.9,
    }),
  ];
  const calc = resolveDescontosContaCoopMesParaCalculo(arquivo, memoria, true);
  assert.equal(calc.length, 1);
  assert.equal(liquidoUsoContaCoopMes(calc), 79.9);
}

console.log("test-hb-dedupe-incidencia-h89117: OK");
