/**
 * HB PASSO 3A — projeção A receber pós-compra (caracterização 203,32 − 100 = 103,32).
 * npx tsx scripts/test-hb-authorize-projecao-a-receber.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { dedupeDescontosContaCoopRemotos } from "../src/lib/hb-credit/mergeFichaDescontos";
import { impactoAReceberReais, valorReaisLinhaResumoCooperado } from "../src/lib/hb-credit/utilizacaoResumo";
import {
  getResumoPagamentoCooperado,
  getResumoPagamentoParaRegistro,
  persistDescontosContaCoopNoArquivo,
} from "../src/services/notaPedidoService";

const COOP = "coop-hb3a";
const COOPERADO = "c_hb3a";
const MES = "2026-09";
const TX_ID = "tx_hb3a_100";

function miniData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "00000000000191", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "HB 3A",
        cpf: "00000000000",
        status: "ativo",
        createdAt: "",
      },
    ],
    users: [],
    notasPedido: [
      {
        id: "np_hb3a",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        numeroNota: "2026-9001",
        mesReferencia: MES,
        status: "conferida",
        valorBruto: 214.02,
        valorLiquido: 203.32,
        dataEntrega: "2026-09-15T12:00:00.000Z",
        itens: [],
      },
    ],
    fichaCorrida: [
      {
        id: "fc_hb3a",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        mesReferencia: MES,
        notaPedidoId: "np_hb3a",
        valorBruto: 214.02,
        valorLiquido: 203.32,
        descontos: 10.7,
        status: "pendente",
        descricao: "Nota teste",
        dataLancamento: "2026-09-15",
        dataPagamentoPrevista: "2026-09-30",
      },
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

// Compra R$ 100 — impacto A receber
{
  const tx = {
    event_type: "PAYMENT",
    status: "posted",
    amount_cents: 10000,
    credit_debited_cents: 10000,
    gross_amount_cents: 10000,
  };
  assert.equal(impactoAReceberReais(tx), -100);
  assert.equal(valorReaisLinhaResumoCooperado(tx), 100);
}

// Projeção ficha: 203,32 − 100 = 103,32
{
  let data = miniData();
  const base = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  assert.equal(base.valorEntregas, 203.32);

  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    {
      motivo: "Compra HB Créditos — Mercado teste (ABC)",
      valorReais: 100,
      tipo: "conta_coop",
      createdAt: "2026-09-29T12:00:00.000Z",
      hbTransactionId: TX_ID,
    },
  ]);
  const rel = getResumoPagamentoParaRegistro(
    getResumoPagamentoCooperado(data, COOPERADO, MES, COOP),
    data,
    COOPERADO,
    MES,
    COOP
  );
  assert.equal(rel.valorLiquido, 103.32);
}

// Dedupe idempotency — mesma hbTransactionId
{
  const dup = dedupeDescontosContaCoopRemotos([
    {
      motivo: "Compra HB",
      valorReais: 100,
      tipo: "conta_coop",
      hbTransactionId: TX_ID,
    },
    {
      motivo: "Compra HB",
      valorReais: 100,
      tipo: "conta_coop",
      hbTransactionId: TX_ID,
    },
  ]);
  assert.equal(dup.length, 1);
}

// Estorno compatível (sem alterar fluxo): REFUND devolve impacto
{
  const refund = {
    event_type: "REFUND",
    status: "posted",
    amount_cents: 10000,
    credit_debited_cents: 10000,
    gross_amount_cents: 10000,
  };
  assert.equal(impactoAReceberReais(refund), 100);
  assert.equal(103.32 + impactoAReceberReais(refund), 203.32);
}

console.log("OK — hb authorize projeção A receber (3A caracterização)");
