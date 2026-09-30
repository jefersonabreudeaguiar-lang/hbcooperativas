/**
 * Simula push local pago sobre nuvem pendente (Cleber/Ivan).
 * npx tsx scripts/verify-merge-ficha-phantom.ts
 */
import assert from "node:assert/strict";
import type { FichaCorrida, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import { cooperadoMesTemPagamentoNaLista, sanitizarOperacionalSyncPayload } from "../src/services/pagamentoIntegridadeService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";

// import merge via re-export — duplicate minimal merge test using exported logic from sync
// We test sanitizar + cooperadoMesTemPagamentoNaLista; merge is inline in cooperativaSyncCloudService

const CLEBER = "c_1782257422774_9chl9";
const MES = "2026-08";

const cloudFicha: FichaCorrida = {
  id: "fc_test",
  cooperadoId: CLEBER,
  cooperativaId: "coop",
  notaPedidoId: "n1",
  mesReferencia: MES,
  status: "pendente",
  valorBruto: 100,
  descontos: 0,
  valorLiquido: 100,
  saldoAcumulado: 100,
  descricao: "test",
  dataLancamento: "2026-09-21",
  createdAt: "2026-09-21T19:00:00.000Z",
  updatedAt: "2026-09-21T19:41:00.000Z",
};

const localFicha: FichaCorrida = {
  ...cloudFicha,
  status: "pago",
  updatedAt: "2026-09-21T20:00:00.000Z",
};

const pagamentos: PagamentoCooperadoRegistro[] = [];

assert.equal(
  cooperadoMesTemPagamentoNaLista(pagamentos, CLEBER, MES),
  false,
  "sem pagamento registrado"
);

const sanitized = sanitizarOperacionalSyncPayload(
  {
    fichaCorrida: [localFicha],
    pagamentosCooperado: pagamentos,
    notasPedido: [],
  },
  reconciliarFichaFromNotasConferidas
);

assert.equal(sanitized.fichaCorrida?.[0]?.status, "pendente", "API sanitiza ficha pago fantasma");

console.log("OK verify-merge-ficha-phantom");
