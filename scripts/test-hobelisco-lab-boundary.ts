/**
 * Testes da fronteira Hobelisco LAB ↔ Produção
 * Executar: npm run test:hobelisco-lab-boundary
 */
import {
  evaluateHobeliscoLabBoundary,
  extractSupabaseProjectRef,
  isHobeliscoBoundaryClearForOperation,
  neverPromoteToProduction,
} from "../src/lib/lab/hobeliscoLabBoundary";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

console.log("Hobelisco LAB boundary tests\n");

assert(
  "extractSupabaseProjectRef",
  extractSupabaseProjectRef("https://abc123.supabase.co") === "abc123"
);

const prodDeploy = env({
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  HOBELISCO_ENVIRONMENT: "PRODUCTION",
  HB_HOBELISCO_V2_ENABLED: "true",
});
const prodReport = evaluateHobeliscoLabBoundary(prodDeploy);
assert("production deploy locked", prodReport.productionLocked === true);
assert("production blocks observer path", isHobeliscoBoundaryClearForOperation(prodDeploy) === false);
assert("production flags tripwire", prodReport.tripwires.some((t) => t.id === "PRODUCTION_FLAGS_DETECTED"));

const cleanProd = env({
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  HOBELISCO_ENVIRONMENT: "PRODUCTION",
});
const cleanProdReport = evaluateHobeliscoLabBoundary(cleanProd);
assert("clean production has no hobelisco flags tripwire", cleanProdReport.tripwires.length === 0);
assert("clean production still locked", cleanProdReport.productionLocked === true);

const labMirror = env({
  NODE_ENV: "production",
  VERCEL_ENV: "preview",
  HOBELISCO_ENVIRONMENT: "LAB",
  HB_HOBELISCO_LAB_DEPLOY: "true",
  HB_HOBELISCO_MIRROR_ENABLED: "true",
  HB_HOBELISCO_BOUNDARY_STRICT: "true",
  HB_HOBELISCO_LAB_SUPABASE_URL: "https://lab-only.supabase.co",
  HB_HOBELISCO_LAB_SERVICE_ROLE_KEY: "lab-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://prod-real.supabase.co",
  HB_HOBELISCO_PRODUCTION_SUPABASE_REF: "prod-real",
  HB_HOBELISCO_STAGING_ENABLED: "true",
  HB_HOBELISCO_V2_ENABLED: "true",
  HB_HOBELISCO_OBSERVE_ONLY: "true",
});
const labReport = evaluateHobeliscoLabBoundary(labMirror);
assert("lab mirror deploy kind", labReport.deployKind === "lab-mirror");
assert("lab mirror safe with isolated db", labReport.safe === true);
assert("lab mirror isolated refs", labReport.checks.appAndHobeliscoDbIsolated === true);

const sameDb = env({
  ...labMirror,
  HB_HOBELISCO_LAB_SUPABASE_URL: "https://prod-real.supabase.co",
});
const sameDbReport = evaluateHobeliscoLabBoundary(sameDb);
assert("same supabase ref blocked", sameDbReport.safe === false);
assert(
  "same supabase tripwire",
  sameDbReport.tripwires.some((t) => t.id === "PRODUCTION_SUPABASE_REF_MATCH")
);

let neverPromoteThrown = false;
try {
  neverPromoteToProduction();
} catch (e) {
  neverPromoteThrown = e instanceof Error && e.message.includes("NEVER_PROMOTE");
}
assert("neverPromoteToProduction throws", neverPromoteThrown);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
