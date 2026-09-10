/**
 * Fundação de segurança HB Coop — veredito do dono (sem quebrar defaults)
 * Executar: npm run test:owner-security
 */
import fs from "node:fs";
import {
  canAccessCooperativaCnpj,
  requireCooperativaAccess,
} from "../src/lib/security/apiGuard";
import { assertSameCooperative } from "../src/modules/hb-credit/security/cooperativeIsolation";
import {
  buildCreditObservation,
  evaluateCreditObservation,
  filterActionableFindings,
} from "../src/lib/lab/hbCreditWatch/rules";
import {
  isDistributedRateLimitConfigured,
} from "../src/lib/security/distributedRateLimit";
import {
  isStaffMfaEnforced,
  isStaffMfaFeatureEnabled,
  isStaffRole,
  staffMfaDeniedResponse,
} from "../src/lib/security/staffAccessPolicy";
import { resolveAccessTokenTtl, getDefaultAccessTokenTtl } from "../src/lib/security/sessionPolicy";
import type { SessionClaims } from "../src/lib/security/jwt";

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

const coopA = "62351750000165";
const coopB = "11222333000181";

const cooperadoSession: SessionClaims = {
  sub: "u1",
  email: "c@test.com",
  name: "Cooperado",
  role: "cooperado",
  cooperativaCnpj: coopA,
  cooperadoId: "c1",
};

const responsavelSession: SessionClaims = {
  sub: "u2",
  email: "r@test.com",
  name: "Resp",
  role: "responsavel",
  cooperativaCnpj: coopA,
};

function testCrossTenantAccess() {
  console.log("\n[cross-tenant / isolamento]");
  ok("cooperado acessa própria coop", canAccessCooperativaCnpj(cooperadoSession, coopA));
  ok("cooperado NÃO acessa outra coop", !canAccessCooperativaCnpj(cooperadoSession, coopB));
  ok("admin acessa qualquer coop", canAccessCooperativaCnpj({ ...cooperadoSession, role: "admin", cooperativaCnpj: coopA }, coopB));

  const denied = requireCooperativaAccess(cooperadoSession, coopB, true);
  ok("requireCooperativaAccess bloqueia cross-tenant", denied !== null && denied.status === 403);

  expectThrow("HB Credit assertSameCooperative bloqueia CNPJ diferente", () =>
    assertSameCooperative(coopA, coopB)
  );
  ok("HB Credit assertSameCooperative aceita mesmo CNPJ", (() => {
    assertSameCooperative(coopA, coopA);
    return true;
  })());
}

function testSecurityHeadersConfig() {
  console.log("\n[headers de segurança]");
  const config = fs.readFileSync("next.config.ts", "utf8");
  ok("X-Frame-Options configurado", config.includes("X-Frame-Options"));
  ok("HSTS configurado", config.includes("Strict-Transport-Security"));
  ok("CSP configurado", config.includes("Content-Security-Policy"));
  ok("poweredByHeader desligado", config.includes("poweredByHeader: false"));
}

function testStaffPolicyDefaults() {
  console.log("\n[staff MFA / sessão — defaults OFF]");
  const env = { ...process.env };
  delete env.HB_STAFF_MFA_REQUIRED;
  delete env.HB_STAFF_SESSION_TTL_HOURS;
  ok("MFA staff desligado por default", !isStaffMfaEnforced(env));
  ok("cooperado não é staff", !isStaffRole("cooperado"));
  ok("responsável é staff", isStaffRole("responsavel"));
  ok(
    "staff sem MFA não bloqueado quando flag OFF",
    staffMfaDeniedResponse(responsavelSession, true) === null
  );
  ok("TTL default cooperado 7d", resolveAccessTokenTtl("cooperado", env) === "7d");
  ok("TTL default staff 7d sem env", resolveAccessTokenTtl("responsavel", env) === "7d");
  ok("getDefaultAccessTokenTtl", getDefaultAccessTokenTtl() === "7d");
}

function testStaffPolicyWhenEnabled() {
  console.log("\n[staff MFA / sessão — feature desligada no app]");
  ok("MFA feature desligado no app", !isStaffMfaFeatureEnabled());
  const env = {
    ...process.env,
    HB_STAFF_MFA_REQUIRED: "true",
    HB_STAFF_SESSION_TTL_HOURS: "24",
  };
  ok("MFA policy ignorada enquanto feature OFF", !isStaffMfaEnforced(env));
  ok(
    "staff não bloqueado por MFA (feature OFF)",
    staffMfaDeniedResponse(responsavelSession, true, env) === null
  );
  ok(
    "totp na sessão não bloqueia (feature OFF)",
    staffMfaDeniedResponse({ ...responsavelSession, totpEnabled: true }, true, env) === null
  );
  ok("TTL staff 24h quando env", resolveAccessTokenTtl("responsavel", env) === "24h");
  ok("TTL cooperado permanece 7d", resolveAccessTokenTtl("cooperado", env) === "7d");
}

function testTotpCrypto() {
  console.log("\n[TOTP staff]");
  const { generateTotpSecret, generateTotpCode, verifyTotpCode, buildTotpUri } = require("../src/lib/security/staffTotp") as typeof import("../src/lib/security/staffTotp");
  const secret = generateTotpSecret();
  ok("segredo TOTP gerado", secret.length >= 16);
  const code = generateTotpCode(secret);
  ok("código 6 dígitos", /^\d{6}$/.test(code));
  ok("verify aceita código válido", verifyTotpCode(secret, code));
  ok("verify rejeita código errado", !verifyTotpCode(secret, "000000"));
  ok("URI otpauth", buildTotpUri(secret, "admin@test.com").startsWith("otpauth://totp/"));
}

function testSecurityStackHealth() {
  console.log("\n[stack health]");
  const { buildSecurityStackHealth } = require("../src/lib/security/securityStackHealth") as typeof import("../src/lib/security/securityStackHealth");
  const health = buildSecurityStackHealth({});
  ok("health retorna crons", health.crons.some((c) => c.path.includes("credit-reconciliation")));
  ok("health inclui recomendações", health.recommendations.length > 0);
  ok("rota admin security health existe", fs.existsSync("src/app/api/admin/security/health/route.ts"));
  ok("health MFA feature desligado", health.staffMfaFeatureEnabled === false);
}

function testVercelCronRegistered() {
  console.log("\n[vercel cron]");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as { crons?: Array<{ path: string }> };
  ok(
    "credit-reconciliation no vercel.json",
    vercel.crons?.some((c) => c.path === "/api/cron/credit-reconciliation") === true
  );
}

function testDistributedRateLimitFallback() {
  console.log("\n[rate limit distribuído]");
  const env = { ...process.env };
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;
  ok("Upstash não configurado em dev típico", !isDistributedRateLimitConfigured(env));
}

function testCreditReconciliationLogic() {
  console.log("\n[reconciliação crédito — lógica read-only]");
  const row = {
    accountId: "c1",
    cooperadoId: "c1",
    limitCents: 100000,
    usedCents: 40000,
    availableCents: 50000,
  };
  const obs = buildCreditObservation(coopA, row, new Date().toISOString());
  const findings = filterActionableFindings(evaluateCreditObservation(obs, "snap1"));
  ok("detecta divergência available vs limit-used", findings.some((f) => f.eventType === "credit_integrity_divergence"));

  const okRow = { ...row, availableCents: 60000 };
  const okObs = buildCreditObservation(coopA, okRow, new Date().toISOString());
  const okFindings = filterActionableFindings(evaluateCreditObservation(okObs, "snap2"));
  ok("conta consistente sem achados", okFindings.length === 0);

  const overRow = { ...row, usedCents: 120000, availableCents: -20000 };
  const overObs = buildCreditObservation(coopA, overRow, new Date().toISOString());
  const overFindings = filterActionableFindings(evaluateCreditObservation(overObs, "snap3"));
  ok("detecta over limit", overFindings.some((f) => f.eventType === "credit_integrity_over_limit"));
}

function testPlatformAuditSources() {
  console.log("\n[auditoria plataforma]");
  const login = fs.readFileSync("src/app/api/auth/login/route.ts", "utf8");
  ok("login registra falha", login.includes("auth.login_failed"));
  ok("login registra sucesso", login.includes("auth.login"));
  const apiGuard = fs.readFileSync("src/lib/security/apiGuard.ts", "utf8");
  ok("apiGuard audita cross-tenant", apiGuard.includes("recordCrossTenantBlocked"));
  const events = fs.readFileSync("src/lib/security/platformSecurityEvents.ts", "utf8");
  ok("evento credit.reconciliation_alert definido", events.includes("credit.reconciliation_alert"));
}

function testCronReconciliationRoute() {
  console.log("\n[cron reconciliação]");
  ok(
    "rota cron existe",
    fs.existsSync("src/app/api/cron/credit-reconciliation/route.ts")
  );
  const route = fs.readFileSync("src/app/api/cron/credit-reconciliation/route.ts", "utf8");
  ok("cron exige CRON_SECRET", route.includes("CRON_SECRET"));
  ok("cron usa runCreditReconciliationForCoop", route.includes("runCreditReconciliationForCoop"));
}

function main() {
  console.log("HB Coop — testes fundação segurança (veredito dono)");
  testCrossTenantAccess();
  testSecurityHeadersConfig();
  testStaffPolicyDefaults();
  testStaffPolicyWhenEnabled();
  testTotpCrypto();
  testDistributedRateLimitFallback();
  testCreditReconciliationLogic();
  testPlatformAuditSources();
  testCronReconciliationRoute();
  testSecurityStackHealth();
  testVercelCronRegistered();
  console.log(`\nResultado: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
