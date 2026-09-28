/**
 * BIC LAB boundary — bateria fail-closed.
 * npm run test:bic-lab-boundary
 */
import assert from "node:assert/strict";
import {
  evaluateBicLabBoundary,
  isBicBoundaryClearForLabOperation,
} from "../src/lib/lab/bicLabBoundary.ts";
import { isBicLabEnabledServer } from "../src/lib/lab/bicLabGate.ts";

function caseProdOfficialWithLabFlags() {
  const r = evaluateBicLabBoundary({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    BIC_ENVIRONMENT: "LAB",
    HB_BIC_LAB_ENABLED: "true",
    HB_BIC_MIRROR_ENABLED: "true",
    HB_BIC_LAB_DEPLOY: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://aaaaaaaaaaaaaaaa.supabase.co",
  });
  assert.equal(r.deployKind, "production-official");
  assert.equal(r.productionLocked, true);
  assert.ok(r.tripwires.some((t) => t.id === "PRODUCTION_BIC_LAB_FLAGS"));
  assert.equal(
    isBicLabEnabledServer({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      HB_BIC_LAB_ENABLED: "true",
    }),
    false
  );
}

function caseLabMirrorOk() {
  const env = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    BIC_ENVIRONMENT: "LAB",
    HB_BIC_LAB_ENABLED: "true",
    NEXT_PUBLIC_HB_BIC_LAB_ENABLED: "true",
    HB_BIC_MIRROR_ENABLED: "true",
    HB_BIC_LAB_DEPLOY: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbb.supabase.co",
  };
  const r = evaluateBicLabBoundary(env);
  assert.equal(r.deployKind, "lab-mirror");
  assert.equal(r.safe, true);
  assert.equal(isBicBoundaryClearForLabOperation(env), true);
  assert.equal(isBicLabEnabledServer(env), true);
}

function caseLabMirrorBlocksProdSupabase() {
  const env = {
    NODE_ENV: "development",
    BIC_ENVIRONMENT: "LAB",
    HB_BIC_MIRROR_ENABLED: "true",
    HB_BIC_LAB_DEPLOY: "true",
    HB_BIC_LAB_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://ifptyzikekrswippzmsf.supabase.co",
  };
  const r = evaluateBicLabBoundary(env);
  assert.equal(r.safe, false);
  assert.ok(r.tripwires.some((t) => t.id === "LAB_APP_POINTS_TO_PRODUCTION_SUPABASE"));
}

function caseLocalDevWithoutFlags() {
  const env = {
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://cccccccccccccccc.supabase.co",
  };
  assert.equal(isBicLabEnabledServer(env), false);
}

function main() {
  caseProdOfficialWithLabFlags();
  caseLabMirrorOk();
  caseLabMirrorBlocksProdSupabase();
  caseLocalDevWithoutFlags();
  console.log("BIC LAB boundary: OK");
}

main();
