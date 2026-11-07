import assert from "node:assert/strict";
import type { ContaCoopLimiteCooperado } from "../src/modules/hb-credit/types";
import { mergeHbPaymentLimiteForScan, normalizeHbPaymentLimiteDisponivel, hbPaymentAvailableCents, canAffordHbPaymentWithLimite } from "../src/modules/hb-credit/engine/paymentAffordability";

const fresh: ContaCoopLimiteCooperado = {
  id: "account", cooperativaCnpj: "88888888000181", cooperadoId: "member",
  limiteLiberadoCents: 50000, valorUsadoCents: 0, valorDisponivelCents: 20000,
  cashbackDisponivelCents: 100, saldoProprioDisponivelCents: 300,
  bloqueado: false, updatedAt: "2026-11-06T13:00:00Z",
};
const old = { ...fresh, valorDisponivelCents: 50000, cashbackDisponivelCents: 9000, saldoProprioDisponivelCents: 8000, updatedAt: "2026-11-06T12:00:00Z" };
assert.equal(normalizeHbPaymentLimiteDisponivel(fresh).valorDisponivelCents, 20000, "teto menor recebido da nuvem permanece menor");
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh, old), fresh, "cache antigo mais alto não recompõe saldo, cashback ou saldo próprio");
assert.deepEqual(mergeHbPaymentLimiteForScan(old, fresh), fresh, "consulta mais nova reduz saldo de QR antigo");
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh, { ...old, updatedAt: fresh.updatedAt }), fresh, "empate preserva o QR validado");
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh, { ...old, updatedAt: "inválida" }), fresh);
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh, { ...old, cooperadoId: "outro", updatedAt: "2026-11-06T14:00:00Z" }), fresh);
assert.deepEqual(mergeHbPaymentLimiteForScan(fresh, { ...old, cooperativaCnpj: "99999999000191", updatedAt: "2026-11-06T14:00:00Z" }), fresh);
const receivedOnly = { ...fresh, limiteLiberadoCents: 0, valorDisponivelCents: 0, saldoProprioDisponivelCents: 1500 };
assert.equal(hbPaymentAvailableCents(receivedOnly), 1500, "repasse recebido pode ser usado sem limite de entregas");
assert.equal(canAffordHbPaymentWithLimite(receivedOnly, 1500, false), true);
assert.equal(canAffordHbPaymentWithLimite(receivedOnly, 1501, false), false);
assert.equal(hbPaymentAvailableCents({ ...receivedOnly, bloqueado: true }), 0);
assert.equal(canAffordHbPaymentWithLimite({ ...receivedOnly, bloqueado: true }, 100, true), false);
console.log("PASS: leitura recente preservada, teto respeitado, isolamento da conta e saldo recebido sem inflar crédito.");
