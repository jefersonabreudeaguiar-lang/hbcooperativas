/**
 * HB-002 — alinhamento HB Crédito: SQL (motor) × operacional × A receber (in-memory).
 * npx tsx scripts/test-hb-002-alignment.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { computeAmountUsedCentsFromPayments } from "../src/lib/hb-credit/creditAmountUsedFichaQuitada";
import { computeDisponivel } from "../src/modules/hb-credit/engine/money";
import {
  liquidoUsoContaCoopMes,
  mergeDescontosContaCoopNoResumo,
  dedupeDescontosContaCoopRemotos,
  type DescontoContaCoopRemoto,
} from "../src/lib/hb-credit/mergeFichaDescontos";
import {
  resolveDescontosContaCoopMesParaCalculo,
  setContaCoopDescontosMemoria,
} from "../src/lib/hb-credit/contaCoopDescontosMemory";
import { markContaCoopDescontosMesFetchOk } from "../src/lib/hb-credit/contaCoopDescontosSyncHealth";
import {
  getDescontosContaCoopMesCached,
  getResumoPagamentoExibicao,
  persistDescontosContaCoopNoArquivo,
} from "../src/services/notaPedidoService";
import { impactoAReceberReais } from "../src/lib/hb-credit/utilizacaoResumo";

const COOP = "coop-hb002";
const COOPERADO = "c_hb002";
const MES = "2026-09";

function baseData(partial: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "HB002",
        cpf: "000",
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
        mesReferencia: MES,
        status: "conferida",
        valorBruto: 500,
        valorLiquido: 500,
        instituicaoId: "i1",
        itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 500 }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    fichaCorrida: [
      {
        id: "f1",
        cooperadoId: COOPERADO,
        cooperativaId: COOP,
        notaPedidoId: "n1",
        mesReferencia: MES,
        status: "pendente",
        valorBruto: 500,
        descontos: 0,
        valorLiquido: 500,
        descricao: "Entrega",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
    ...partial,
  } as AppData;
}

function sqlRowsToDescontos(
  txs: Array<{
    id: string;
    event_type: string;
    status: string;
    amount_cents: number;
    credit_debited_cents?: number;
    created_at: string;
    partner?: string;
  }>
): DescontoContaCoopRemoto[] {
  return dedupeDescontosContaCoopRemotos(
    txs.map((t) => {
      const debited = (t.credit_debited_cents ?? t.amount_cents) / 100;
      const isRefund = t.event_type === "REFUND";
      const isReversed = t.event_type === "PAYMENT" && t.status === "reversed";
      const valorReais = isRefund
        ? t.amount_cents / 100
        : isReversed
          ? (t.amount_cents / 100) * (t.credit_debited_cents ? 0 : 1)
          : debited;
      return {
        motivo: isRefund
          ? `Estorno HB Créditos — ${t.partner ?? "Mercado"}`
          : `Compra HB Créditos — ${t.partner ?? "Mercado"} (${t.id.slice(-8)})`,
        valorReais,
        tipo: "conta_coop" as const,
        createdAt: t.created_at,
        hbTransactionId: t.id,
      };
    })
  );
}

// Fórmulas oficiais (motor)
{
  const usado = computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "posted", amount_cents: 10000, credit_debited_cents: 8000 },
    { event_type: "REFUND", status: "posted", amount_cents: 2000, credit_debited_cents: 2000 },
  ]);
  assert.equal(usado, 8000, "PAYMENT posted soma debit; REFUND posted não entra no usado SQL");
  assert.equal(computeDisponivel(50000, usado), 42000);
}

// Triangulação: txs SQL → desconto ficha → A receber
{
  const txs = [
    {
      id: "tx_1",
      event_type: "PAYMENT",
      status: "posted",
      amount_cents: 12000,
      credit_debited_cents: 12000,
      created_at: "2026-09-10T12:00:00.000Z",
      partner: "Mercado A",
    },
  ];
  const descontos = sqlRowsToDescontos(txs);
  const liquido = liquidoUsoContaCoopMes(descontos);
  const usadoCents = computeAmountUsedCentsFromPayments(txs);
  assert.equal(liquido, usadoCents / 100);
  let data = baseData();
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, descontos);
  const exib = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.equal(exib.valorEntregas, 500);
  assert.equal(exib.valorLiquido, 500 - liquido);
}

// Compra + estorno → uso líquido zero
{
  const txs = [
    {
      id: "tx_p",
      event_type: "PAYMENT",
      status: "posted",
      amount_cents: 5000,
      credit_debited_cents: 5000,
      created_at: "2026-09-11T10:00:00.000Z",
    },
    {
      id: "tx_r",
      event_type: "REFUND",
      status: "posted",
      amount_cents: 5000,
      created_at: "2026-09-11T11:00:00.000Z",
    },
  ];
  const lines = sqlRowsToDescontos(txs);
  assert.equal(liquidoUsoContaCoopMes(lines), 0);
  assert.equal(impactoAReceberReais(txs[0]!) + impactoAReceberReais(txs[1]!), 0);
}

// HB-002: operacional stale + SQL vazio após sync autoritativo
{
  let data = baseData();
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB stale operacional",
      valorReais: 80,
      tipo: "conta_coop",
      createdAt: "2026-09-09T10:00:00.000Z",
    },
  ]);
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, []);
  markContaCoopDescontosMesFetchOk(COOP, COOPERADO, MES);
  const cached = getDescontosContaCoopMesCached(data, COOPERADO, MES, COOP);
  assert.equal(liquidoUsoContaCoopMes(cached), 0, "SQL vazio vence arquivo stale após fetch OK");
  const exib = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.equal(exib.valorLiquido, 500);
}

// Poll vazio sem autoridade → mantém arquivo (offline)
{
  const arquivo = [
    { motivo: "Compra HB", valorReais: 30, tipo: "conta_coop" as const, createdAt: "2026-09-05T10:00:00.000Z" },
  ];
  const resolved = resolveDescontosContaCoopMesParaCalculo(arquivo, [], true, false);
  assert.equal(liquidoUsoContaCoopMes(resolved), 30);
}

// Não duplicação: mesma tx local + cloud
{
  const dup = dedupeDescontosContaCoopRemotos([
    {
      motivo: "Compra HB — Mercado (AAA)",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-09-12T10:00:00.000Z",
      hbTransactionId: "tx_dup",
    },
    {
      motivo: "Compra HB — Mercado (AAA)",
      valorReais: 40,
      tipo: "conta_coop",
      createdAt: "2026-09-12T10:00:00.000Z",
      hbTransactionId: "tx_dup",
    },
  ]);
  assert.equal(dup.length, 1);
  const resumo = mergeDescontosContaCoopNoResumo(
    {
      valorBruto: 500,
      descontoCooperativa: 0,
      descontosExtras: [],
      valorEntregas: 500,
      valorLiquido: 500,
      fichaIds: ["f1"],
      notaPedidoIds: ["n1"],
    },
    dup
  );
  assert.equal(resumo.valorLiquido, 460);
}

console.log("OK — test-hb-002-alignment");
