/**
 * Fase C — painel Saúde HB + API ops-health + runbook.
 * npm run test:hb-credit-phase-c
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const content = read("src/app/(app)/conta-coop/ContaCoopContent.tsx");
const api = read("src/app/api/credit/ops-health/route.ts");
const health = read("src/lib/hb-credit/security/hbCreditOpsHealth.ts");
const runbook = read("src/lib/hb-credit/security/hbCreditOpsRunbook.ts");
const docs = read("docs/hb-credit-fase-c-runbook.md");
const service = read("src/services/creditApiService.ts");

assert.match(content, /ContaCoopOpsHealthPanel/, "aba Saúde no conta-coop");
assert.match(content, /"saude"/, "tab saude");
assert.match(api, /buildHbCreditOpsHealth/, "API monta snapshot");
assert.match(api, /requireCreditStaff/, "API só staff");
assert.match(health, /cooperadoImpact/, "explica impacto cooperado");
assert.match(runbook, /HB_CREDIT_RUNBOOK_STEPS/, "runbook embutido");
assert.match(docs, /HB_CREDIT_OPERATIONS_ENABLED/, "doc pausa operações");
assert.match(service, /fetchCreditOpsHealth/, "cliente chama ops-health");

console.log("OK: contrato HB Créditos Fase C");
