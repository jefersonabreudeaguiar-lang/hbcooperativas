import { computeAmountUsedCentsFromPayments } from "../src/lib/supabase/creditAmountUsedReconcile.ts";
import { buildFichaQuitadaWindowsForTitularIds } from "../src/lib/hb-credit/creditAmountUsedFichaQuitada.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";

function ok(label: string, cond: boolean) {
  if (!cond) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("OK:", label);
}

ok(
  "só PAYMENT posted conta",
  computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "posted", amount_cents: 1000, credit_debited_cents: 1111 },
    { event_type: "PAYMENT", status: "reversed", amount_cents: 999, credit_debited_cents: 999 },
    { event_type: "REFUND", status: "posted", amount_cents: 999 },
  ]) === 1111
);

ok(
  "estornados não entram",
  computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "reversed", amount_cents: 1111, credit_debited_cents: 1111 },
  ]) === 0
);

ok(
  "fallback amount_cents",
  computeAmountUsedCentsFromPayments([{ event_type: "PAYMENT", status: "posted", amount_cents: 500 }]) === 500
);

const op: OperacionalSyncPayload = {
  pagamentosCooperado: [
    {
      id: "pay1",
      cooperativaId: "coop",
      cooperadoId: "c_orlando",
      mesReferencia: "2026-09",
      valorBruto: 100,
      descontoCooperativa: 0,
      descontosExtras: [],
      valorLiquido: 79,
      fichaIds: [],
      notaPedidoIds: [],
      status: "confirmado",
      pagoPor: "resp",
      pagoEm: "2026-09-28T12:00:00.000Z",
      assinadoEm: "2026-09-29T10:00:00.000Z",
      createdAt: "2026-09-28T12:00:00.000Z",
    },
  ],
  arquivosMensais: [
    {
      id: "arq1",
      cooperativaId: "coop",
      cooperadoId: "c_orlando",
      mesReferencia: "2026-09",
      fotos: [],
      createdAt: "",
      contaCoopDescontos: [
        {
          motivo: "Compra HB Créditos — Mercado",
          valorReais: 79,
          tipo: "conta_coop",
          createdAt: "2026-09-15T14:00:00.000Z",
          hbTransactionId: "tx_79",
        },
      ],
    },
  ],
};

const fichaCtx = buildFichaQuitadaWindowsForTitularIds(op, ["c_orlando"]);

ok(
  "compra quitada na ficha não entra no utilizado (id explícito)",
  computeAmountUsedCentsFromPayments(
    [
      {
        id: "tx_79",
        created_at: "2026-09-15T14:00:00.000Z",
        event_type: "PAYMENT",
        status: "posted",
        amount_cents: 7900,
        credit_debited_cents: 7900,
      },
      {
        id: "tx_novo",
        created_at: "2026-10-02T12:00:00.000Z",
        event_type: "PAYMENT",
        status: "posted",
        amount_cents: 500,
        credit_debited_cents: 500,
      },
    ],
    fichaCtx
  ) === 500
);

ok(
  "compra quitada por janela do mês (sem hbTransactionId no arquivo)",
  computeAmountUsedCentsFromPayments(
    [
      {
        id: "tx_sem_id_arquivo",
        created_at: "2026-09-20T11:00:00.000Z",
        event_type: "PAYMENT",
        status: "posted",
        credit_debited_cents: 7900,
        amount_cents: 7900,
      },
    ],
    fichaCtx
  ) === 0
);

console.log("\nTodos os testes passaram.");
