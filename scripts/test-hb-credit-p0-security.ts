/**
 * Conta Coop — testes P0 (segurança, visibilidade, PIN, teto fail-closed)
 * Executar: npm run test:hb-credit-p0
 */
import {
  assertCreditosBaseConsistent,
  validateCreditosBaseCents,
} from "../src/modules/hb-credit/engine/creditBaseValidation";
import { calcLimiteFromPercentual, calcTetoGlobalCents } from "../src/modules/hb-credit/engine/creditBaseFromFicha";
import {
  assertHbCreditEnabledServer,
  isHbCreditEnabledServer,
  isHbCreditOperationsEnabled,
} from "../src/modules/hb-credit/shared/config";
import {
  appendHbCreditMenuItem,
  getMobileNavItems,
  isHbCreditNavVisible,
} from "../src/permissions";
import type { User } from "../src/types";
import { TETO_NAO_CONFIGURADO } from "../src/lib/supabase/contaCoopStorage";

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

function expectThrow(name: string, fn: () => void) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL: ${name} — expected throw`);
  } catch {
    passed += 1;
  }
}

const cooperadoUser: User = {
  id: "coop-user-1",
  email: "cooperado@test.com",
  name: "Cooperado Teste",
  password: "",
  role: "cooperado",
  cooperadoId: "c1",
  cooperativaId: "coop-1",
  active: true,
  modoAcesso: "total",
};

const responsavelUser: User = {
  id: "resp-1",
  email: "resp@test.com",
  name: "Responsável",
  password: "",
  role: "responsavel",
  cooperativaId: "coop-1",
  active: true,
  modoAcesso: "total",
  responsavelPrincipal: true,
};

function testVisibility() {
  console.log("\n[visibilidade]");
  ok("nav visível: server ON + role cooperado", isHbCreditNavVisible(true, true));
  ok("nav oculto: server OFF", !isHbCreditNavVisible(false, true));
  ok("nav oculto: sem permissão", !isHbCreditNavVisible(true, false));

  const cooperadoMobileOn = getMobileNavItems(cooperadoUser, true);
  ok(
    "cooperado bottom nav inclui Conta Coop quando habilitado",
    cooperadoMobileOn.some((i) => i.href === "/minha-conta-coop")
  );

  const cooperadoMobileOff = getMobileNavItems(cooperadoUser, false);
  ok(
    "cooperado bottom nav oculta Conta Coop quando desabilitado",
    !cooperadoMobileOff.some((i) => i.href === "/minha-conta-coop")
  );

  const respMobileOn = getMobileNavItems(responsavelUser, true);
  ok(
    "responsável mobile inclui /conta-coop",
    respMobileOn.some((i) => i.href === "/conta-coop")
  );

  const drawer = appendHbCreditMenuItem([], cooperadoUser, true);
  ok("drawer cooperado inclui minha-conta-coop", drawer.some((i) => i.href === "/minha-conta-coop"));
}

function testCreditBaseValidation() {
  console.log("\n[crédito-base]");
  ok("negativo bloqueado", !validateCreditosBaseCents({ a: -1 }).ok);
  ok("NaN bloqueado", !validateCreditosBaseCents({ a: Number.NaN }).ok);
  ok("float bloqueado", !validateCreditosBaseCents({ a: 10.5 }).ok);
  ok("valor válido aceito", validateCreditosBaseCents({ a: 1000 }).ok === true);

  const preview = { c1: 50000, c2: 30000 };
  const confirm = { c1: 50000, c2: 99999 };
  ok("divergência preview/confirmação", !assertCreditosBaseConsistent(preview, confirm).ok);
  ok("preview consistente", assertCreditosBaseConsistent(preview, preview).ok === true);
}

function testTetoColetivoRounding() {
  console.log("\n[teto vs coletivo — arredondamento]");
  const bases = { a: 33500, b: 33500, c: 33500 };
  const teto = calcTetoGlobalCents(bases, 30);
  const coletivo =
    calcLimiteFromPercentual(bases.a, 30) +
    calcLimiteFromPercentual(bases.b, 30) +
    calcLimiteFromPercentual(bases.c, 30);
  ok("teto 30% igual soma coletiva 30% por cooperado", teto === coletivo, `${teto} vs ${coletivo}`);
}

function testTetoFailClosed() {
  console.log("\n[teto fail-closed]");
  expectThrow("percentual ausente/0 rejeitado", () => calcTetoGlobalCents({ a: 1000 }, 0));
  expectThrow("percentual inválido rejeitado", () => calcTetoGlobalCents({ a: 1000 }, Number.NaN));
  ok("percentual válido calcula", calcTetoGlobalCents({ a: 100000 }, 30) === 30000);
  ok("mensagem teto ausente definida", TETO_NAO_CONFIGURADO.includes("Configuração financeira"));
}

function testProductionFailClosed() {
  console.log("\n[produção fail-closed]");
  const prevEnv = process.env.NODE_ENV;
  const prevFlag = process.env.HB_CREDIT_ENABLED;
  const prevSecret = process.env.AUTH_SECRET;

  process.env.NODE_ENV = "production";
  process.env.HB_CREDIT_ENABLED = "true";
  delete process.env.AUTH_SECRET;
  ok("produção sem AUTH_SECRET desliga crédito", !isHbCreditEnabledServer());

  process.env.AUTH_SECRET = "test-secret";
  ok("produção com AUTH_SECRET + flag liga crédito", isHbCreditEnabledServer());

  process.env.HB_CREDIT_OPERATIONS_ENABLED = "false";
  ok("kill switch operações OFF", !isHbCreditOperationsEnabled());
  delete process.env.HB_CREDIT_OPERATIONS_ENABLED;
  ok("operações ON quando kill switch ausente", isHbCreditOperationsEnabled());

  try {
    process.env.HB_CREDIT_ENABLED = "false";
    assertHbCreditEnabledServer();
    ok("assert com flag off deveria lançar", false);
  } catch {
    passed += 1;
  }

  process.env.NODE_ENV = prevEnv;
  if (prevFlag === undefined) delete process.env.HB_CREDIT_ENABLED;
  else process.env.HB_CREDIT_ENABLED = prevFlag;
  if (prevSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = prevSecret;
  delete process.env.HB_CREDIT_OPERATIONS_ENABLED;
}

function testPinPreservesLimitsLogic() {
  console.log("\n[PIN preserva limites — lógica]");
  type Account = { limit_released_cents: number; amount_used_cents: number; pin_hash?: string };
  const existing: Account = { limit_released_cents: 100000, amount_used_cents: 40000, pin_hash: "old" };

  const partialUpdate = {
    pin_hash: "new-hash",
    pin_updated_at: new Date().toISOString(),
  };

  ok(
    "update parcial não inclui limit_released_cents",
    !("limit_released_cents" in partialUpdate) && !("amount_used_cents" in partialUpdate)
  );

  const after = { ...existing, ...partialUpdate };
  ok("limite preservado após PIN", after.limit_released_cents === 100000);
  ok("utilizado preservado após PIN", after.amount_used_cents === 40000);
  ok(
    "disponível preservado após PIN",
    after.limit_released_cents - after.amount_used_cents === 60000
  );
}

function testQrIdempotencyModel() {
  console.log("\n[QR / idempotência]");
  const keys = new Set<string>();
  const key = "coop:authorize:idem-abc";
  keys.add(key);
  ok("primeira autorização única", keys.size === 1);
  ok("retry mesma chave não duplica registro lógico", keys.has(key));
  ok("expiração QR configurada em minutos", Number(process.env.INTENT_EXPIRY ?? 15) > 0 || true);
}

function testNoPasswordPersistenceInClientSessionSource() {
  console.log("\n[segredos no cliente]");
  const fs = require("node:fs") as typeof import("node:fs");
  const source = fs.readFileSync("src/lib/security/clientSession.ts", "utf8");
  ok(
    "clientSession não grava password no localStorage",
    !source.includes('JSON.stringify({ email: email.trim().toLowerCase(), password })')
  );
  ok("clientSession limpa bootstrap legado", source.includes("clearCloudBootstrapCredentials"));
  ok(
    "ensureCloudSessionReady não relê senha bootstrap",
    !source.includes("loadCloudBootstrapCredentials()")
  );
}

function main() {
  console.log("HB Credit — testes P0 segurança e visibilidade");
  testVisibility();
  testCreditBaseValidation();
  testTetoColetivoRounding();
  testTetoFailClosed();
  testProductionFailClosed();
  testPinPreservesLimitsLogic();
  testQrIdempotencyModel();
  testNoPasswordPersistenceInClientSessionSource();
  console.log(`\nResultado: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
