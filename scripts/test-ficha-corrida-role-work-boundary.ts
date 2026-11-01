import assert from "node:assert/strict";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types";
import { emptyInitialData } from "../src/mock/data";
import { buildFichaCorridaStaffQueues } from "../src/lib/responsavel/fichaCorridaStaffQueues";

let reads = 0;
const inaccessibleOperational = new Proxy({} as AppData, {
  get() { reads++; throw new Error("A tela cooperado não deve consultar filas da cooperativa"); },
});
for (const input of [
  { active: true, isCooperado: true },
  { active: false, isCooperado: false },
]) {
  const queues = buildFichaCorridaStaffQueues({
    ...input, data: inaccessibleOperational, cooperativaId: "coop-test", mes: "2026-10",
  });
  assert.equal(Object.values(queues).every((queue) => queue.length === 0), true);
}
assert.equal(reads, 0, "cooperado e aba inativa não percorrem o operacional coletivo");

const payment = {
  id: "awaiting", cooperadoId: "c-test", cooperativaId: "coop-test",
  mesReferencia: "2026-10", status: "aguardando_confirmacao", pagoEm: "2026-10-20T00:00:00.000Z",
} as PagamentoCooperadoRegistro;
const data = {
  ...emptyInitialData,
  pagamentosCooperado: [payment, { ...payment, id: "signed", status: "confirmado", assinaturaCooperado: "test-signature" }],
} as AppData;
const staff = buildFichaCorridaStaffQueues({
  active: true, isCooperado: false, data, cooperativaId: "coop-test", mes: "2026-10",
});
assert.deepEqual(staff.pagamentosAguardandoAssinatura.map((p) => p.id), ["awaiting"]);
assert.deepEqual(staff.pagamentosAguardandoVerificacao.map((p) => p.id), ["signed"]);
const cooperado = buildFichaCorridaStaffQueues({
  active: true, isCooperado: true, data, cooperativaId: "coop-test", mes: "2026-10",
});
assert.equal(Object.values(cooperado).every((queue) => queue.length === 0), true, "troca de papel não carrega a fila anterior");
console.log("OK: Financeiro cooperado não acessa filas coletivas; responsável mantém suas filas; aba inativa não calcula");
