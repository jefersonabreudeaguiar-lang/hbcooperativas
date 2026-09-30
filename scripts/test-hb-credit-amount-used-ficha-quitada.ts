/**
 * Compra HB no mês quitado no pagamento confirmado não entra no “utilizado”.
 * npx tsx scripts/test-hb-credit-amount-used-ficha-quitada.ts
 */
import assert from "node:assert/strict";
import {
  buildFichaQuitadaWindowsForTitularIds,
  computeAmountUsedCentsFromPayments,
  mesReferenciaRangeUtc,
} from "../src/lib/hb-credit/creditAmountUsedFichaQuitada";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";

const COOP = "c_orlando";
const { startMs, endMs } = mesReferenciaRangeUtc("2025-09");

const operacional = {
  pagamentosCooperado: [
    {
      id: "p1",
      cooperadoId: COOP,
      mesReferencia: "2025-09",
      valorBruto: 1000,
      descontoCooperativa: 0,
      descontosExtras: [],
      valorLiquido: 900,
      fichaIds: [],
      notaPedidoIds: [],
      status: "confirmado" as const,
      pagoPor: "resp",
      pagoEm: "2025-09-10T12:00:00.000Z",
      assinadoEm: "2025-09-10T12:00:00.000Z",
      createdAt: "2025-09-10T11:00:00.000Z",
    },
  ],
  arquivosMensais: [],
} as unknown as OperacionalSyncPayload;

const ctx = buildFichaQuitadaWindowsForTitularIds(operacional, [COOP]);
assert.ok(ctx.windows.some((w) => w.mesReferencia === "2025-09" && w.endMs === endMs));

const compra7900 = {
  id: "tx79",
  event_type: "PAYMENT",
  status: "posted",
  amount_cents: 7900,
  credit_debited_cents: 7900,
  created_at: new Date(startMs + 5 * 86400000).toISOString(),
};

const usado = computeAmountUsedCentsFromPayments([compra7900], ctx);
assert.equal(usado, 0, "compra do mês quitado deve zerar utilizado");

const compraOutroMes = {
  ...compra7900,
  id: "tx_out",
  created_at: new Date(endMs + 86400000).toISOString(),
};
const usado2 = computeAmountUsedCentsFromPayments([compraOutroMes], ctx);
assert.equal(usado2, 7900, "compra fora do mês quitado continua no utilizado");

console.log("OK — amount used ficha quitada (mês confirmado)");
