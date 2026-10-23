/**
 * Etapa 3 — ack de release PWA quando bundle alinhado (v551).
 * npx tsx scripts/test-cooperado-etapa3-pwa-ack-v551.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const ack = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobileReleaseLocalAck.ts"), "utf8");
const badge = readFileSync(join(ROOT, "src/components/cooperado/CooperadoMobileBuildBadge.tsx"), "utf8");
const probe = readFileSync(join(ROOT, "src/lib/pwa/pwaReleaseIntegrityProbe.ts"), "utf8");
const manual = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoAtualizarManual.ts"), "utf8");

assert.match(ack, /ackCooperadoPwaReleaseWhenCanonicalMatch/);
assert.match(ack, /cooperadoTemDadosFinanceirosMinimos/);
assert.match(badge, /ackCooperadoPwaReleaseWhenCanonicalMatch/);
assert.match(probe, /markClientReleaseSeen\(official\)/);
assert.match(manual, /ackCooperadoPwaReleaseWhenCanonicalMatch/);

console.log("OK test-cooperado-etapa3-pwa-ack-v551");
