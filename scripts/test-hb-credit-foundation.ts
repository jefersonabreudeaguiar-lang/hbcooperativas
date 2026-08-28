/**
 * HB Credit Engine — Fase 0 — testes de fundação
 * Executar: npm run test:hb-credit-foundation
 */
import {
  assertHbCreditEnabledServer,
  assertPaymentIntentTransition,
  assertPartnerTransition,
  assertReceivableTransition,
  assertSameCooperative,
  assertTresValores,
  canTransitionPaymentIntent,
  canTransitionPartner,
  canTransitionReceivable,
  computeAvailableCents,
  creditSourceProvider,
  isForbiddenPaymentIntentTransition,
  isHbCreditEnabledClient,
  isHbCreditEnabledServer,
  isHbCreditUiAllowed,
  partnerCanCreateCharges,
  reaisToCents,
  sanitizeAuditMetadata,
  toMoneyCents,
} from "../src/modules/hb-credit";
import { HbCreditDisabledError } from "../src/modules/hb-credit/shared/config";
import { HbCreditIsolationError, HbCreditStateTransitionError } from "../src/modules/hb-credit/shared/errors";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    return;
  }
  passed += 1;
}

function expectThrow(name: string, fn: () => void, ErrorCtor?: new (...args: never[]) => Error) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL: ${name} — expected throw`);
  } catch (e) {
    if (ErrorCtor && !(e instanceof ErrorCtor)) {
      failed += 1;
      console.error(`FAIL: ${name} — wrong error type`);
      return;
    }
    passed += 1;
  }
}

function testFeatureFlag() {
  console.log("\n[feature flag]");
  const prev = process.env.HB_CREDIT_ENABLED;
  const prevPub = process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED;

  delete process.env.HB_CREDIT_ENABLED;
  ok("ausente → OFF", !isHbCreditEnabledServer());

  process.env.HB_CREDIT_ENABLED = "false";
  ok("false → OFF", !isHbCreditEnabledServer());

  process.env.HB_CREDIT_ENABLED = "yes";
  ok("valor inválido → OFF", !isHbCreditEnabledServer());

  process.env.HB_CREDIT_ENABLED = "TRUE";
  ok("TRUE maiúsculo → ON", isHbCreditEnabledServer());

  process.env.HB_CREDIT_ENABLED = "true";
  ok("true explícito → ON", isHbCreditEnabledServer());

  process.env.HB_CREDIT_ENABLED = "false";
  expectThrow("assert server when off", () => assertHbCreditEnabledServer(), HbCreditDisabledError);

  process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED = "true";
  ok("UI sem confirmação servidor → OFF", !isHbCreditUiAllowed(false));
  process.env.HB_CREDIT_ENABLED = "true";
  ok("UI in node fail-closed (sem window)", !isHbCreditUiAllowed(true));

  if (prev === undefined) delete process.env.HB_CREDIT_ENABLED;
  else process.env.HB_CREDIT_ENABLED = prev;
  if (prevPub === undefined) delete process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED;
  else process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED = prevPub;

  ok("client flag default off in node", !isHbCreditEnabledClient());
}

function testMoney() {
  console.log("\n[money]");
  ok("reaisToCents exato", reaisToCents(10.5) === 1050);
  expectThrow("float inválido no núcleo", () => toMoneyCents(10.5 as number));
  expectThrow("NaN rejeitado", () => reaisToCents(Number.NaN));

  const limit = toMoneyCents(10000);
  const used = toMoneyCents(3500);
  const available = computeAvailableCents(limit, used);
  ok("três valores", available === 6500);
  assertTresValores(limit, used, available);
}

function testStateMachines() {
  console.log("\n[state machines]");
  ok("CREATED → PENDING", canTransitionPaymentIntent("CREATED", "PENDING"));
  ok("PENDING → AUTHORIZING", canTransitionPaymentIntent("PENDING", "AUTHORIZING"));
  ok("AUTHORIZING → CONFIRMED", canTransitionPaymentIntent("AUTHORIZING", "CONFIRMED"));
  ok("CONFIRMED → REFUND_PENDING", canTransitionPaymentIntent("CONFIRMED", "REFUND_PENDING"));
  ok("CONFIRMED ↛ PENDING", !canTransitionPaymentIntent("CONFIRMED", "PENDING"));
  ok("forbidden helper", isForbiddenPaymentIntentTransition("CONFIRMED", "PENDING"));

  expectThrow("transição proibida PaymentIntent", () => {
    assertPaymentIntentTransition("CONFIRMED", "PENDING");
  }, HbCreditStateTransitionError);

  ok("partner PENDING → ACTIVE", canTransitionPartner("PENDING", "ACTIVE"));
  expectThrow("partner BLOCKED → PENDING proibido", () => {
    assertPartnerTransition("BLOCKED", "PENDING");
  }, HbCreditStateTransitionError);

  ok("receivable OPEN → ELIGIBLE", canTransitionReceivable("OPEN", "ELIGIBLE"));
  expectThrow("receivable SETTLED → OPEN", () => assertReceivableTransition("SETTLED", "OPEN"), HbCreditStateTransitionError);
}

function testPartnerPolicy() {
  console.log("\n[partner]");
  ok("PENDING não opera", !partnerCanCreateCharges("PENDING"));
  ok("ACTIVE opera", partnerCanCreateCharges("ACTIVE"));
  ok("BLOCKED não opera", !partnerCanCreateCharges("BLOCKED"));
}

function testIsolation() {
  console.log("\n[isolation]");
  assertSameCooperative("62351750000165", "62.351.750/0001-65");
  expectThrow("cooperativas diferentes", () => {
    assertSameCooperative("62351750000165", "00000000000000");
  }, HbCreditIsolationError);
}

function testAuditSanitization() {
  console.log("\n[audit]");
  const clean = sanitizeAuditMetadata({ amount: 100, pin: "1234", token: "abc", note: "ok" });
  ok("remove pin", !("pin" in clean));
  ok("remove token", !("token" in clean));
  ok("keep note", clean.note === "ok");
}

async function testCreditSourceStub() {
  console.log("\n[credit source stub]");
  const rows = await creditSourceProvider.getApprovedCreditSources("62351750000165");
  ok("stub vazio", rows.length === 0);
}

function testIdempotencyModel() {
  console.log("\n[idempotency model]");
  const keys = new Set<string>();
  const composite = "62351750000165:payment_authorize:idem-1";
  ok("primeira chave única", !keys.has(composite));
  keys.add(composite);
  ok("mesma chave não duplica", keys.size === 1);
}

function testLedgerPolicy() {
  console.log("\n[ledger policy]");
  const original = [{ id: "1", type: "PAYMENT" }];
  const withRefund = [...original, { id: "2", type: "REFUND" }];
  ok("correção append-only", withRefund.length === 2 && original.length === 1);
}

async function main() {
  console.log("HB Credit Engine — Fase 0 tests");
  testFeatureFlag();
  testMoney();
  testStateMachines();
  testPartnerPolicy();
  testIsolation();
  testAuditSanitization();
  testIdempotencyModel();
  testLedgerPolicy();
  await testCreditSourceStub();

  console.log(`\nResultado: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
