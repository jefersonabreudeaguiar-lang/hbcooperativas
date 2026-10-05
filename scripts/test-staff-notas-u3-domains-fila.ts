/**
 * U3 — domínios de notify + fila de conferência indexada.
 */
import assert from "node:assert/strict";
import { listarPendentesConferenciaResponsavel } from "../src/lib/conferencia/responsavelConferenciaFilaNav.ts";
import { resolveStaffNotasPedidoNotifyDomains } from "../src/lib/performance/staffNotasPedidoNotifyDomains.ts";
import { emptyInitialData } from "../src/mock/data.ts";
import type { NotaPedido } from "../src/types";

const domainsFila = resolveStaffNotasPedidoNotifyDomains({
  isCooperado: false,
  vistaResponsavel: "fila",
  conferirModal: false,
  anexarModal: false,
  abaCooperado: "entregas",
});
assert.deepEqual(domainsFila.sort(), ["notas", "shell"]);

const domainsConferir = resolveStaffNotasPedidoNotifyDomains({
  isCooperado: false,
  vistaResponsavel: "fila",
  conferirModal: true,
  anexarModal: false,
  abaCooperado: "entregas",
});
assert(domainsConferir.includes("financeiro"), "modal conferência inclui financeiro");

const coopId = "coop_test";
const notaFila: NotaPedido = {
  id: "np_u3_1",
  cooperativaId: coopId,
  cooperadoId: "c1",
  status: "aguardando_conferencia",
  createdAt: "2026-01-02T10:00:00.000Z",
  mesReferencia: "2026-01",
  numeroNota: "1",
  itens: [],
  valorTotal: 10,
  valorLiquido: 10,
  descontoPercentual: 0,
  instituicaoId: "i1",
};

const notaOutra: NotaPedido = {
  ...notaFila,
  id: "np_u3_2",
  cooperadoId: "c2",
  createdAt: "2026-01-01T10:00:00.000Z",
};

const data = {
  ...emptyInitialData,
  cooperativas: [{ ...emptyInitialData.cooperativas[0], id: coopId }],
  cooperados: [
    { ...emptyInitialData.cooperados[0], id: "c1", cooperativaId: coopId },
    { ...emptyInitialData.cooperados[0], id: "c2", cooperativaId: coopId, cpf: "2" },
  ],
  notasPedido: [notaFila, notaOutra],
};

const fifo = listarPendentesConferenciaResponsavel(data, coopId);
assert.equal(fifo.length, 2);
assert.equal(fifo[0].id, "np_u3_2", "FIFO por createdAt asc");

console.log("test-staff-notas-u3-domains-fila: OK");
