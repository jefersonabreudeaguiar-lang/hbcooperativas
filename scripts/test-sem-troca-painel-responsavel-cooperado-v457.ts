/**
 * Sem troca responsável ↔ cooperado nos dois lados.
 * npx tsx scripts/test-sem-troca-painel-responsavel-cooperado-v457.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { evaluateResponsavelIdentidade } from "../src/lib/responsavel/responsavelIdentidade.ts";
import { resolveExperienceUser } from "../src/lib/mobileExperience.ts";
import type { AppData, User } from "../src/types/index.ts";

assert.ok(APP_BUILD_VERSION >= 457);

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const bar = readFileSync(join(ROOT, "src/components/permissions/PainelResponsavelMobileBar.tsx"), "utf8");
assert.ok(!bar.includes("Ver como cooperado"));
assert.ok(!bar.includes("Abrir painel responsável"));
assert.ok(bar.includes("return null"));

const layout = readFileSync(join(ROOT, "src/components/layout/AppLayout.tsx"), "utf8");
assert.ok(!layout.includes("PainelResponsavelMobileBar"));
assert.ok(!layout.includes("Ver como cooperado"));

const dashboard = readFileSync(join(ROOT, "src/app/(app)/dashboard/DashboardContent.tsx"), "utf8");
assert.ok(!dashboard.includes("Abrir painel responsável"));
assert.ok(!dashboard.includes("Ver como cooperado"));

const COOP = "coop-1";
const duplo: User = {
  id: "u-resp",
  email: "resp@coop.test",
  name: "Responsável",
  password: "x",
  role: "responsavel",
  cooperativaId: COOP,
  cooperadoId: "coop-member-1",
  active: true,
} as User;
const coop: User = {
  id: "u-coop",
  email: "coop@coop.test",
  name: "Cooperado",
  password: "x",
  role: "cooperado",
  cooperativaId: COOP,
  cooperadoId: "coop-member-1",
  active: true,
} as User;

const data = {
  users: [duplo, coop],
  cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", active: true }],
  cooperados: [],
} as unknown as AppData;

const staffMob = evaluateResponsavelIdentidade({
  accountUser: duplo,
  data,
  dataReady: true,
  mobile: true,
  preferPainelResponsavel: false,
});
assert.equal(staffMob.modo, "gestao");
assert.equal(staffMob.staffPainelUi, true);

const jwtCoop = evaluateResponsavelIdentidade({
  accountUser: coop,
  data,
  dataReady: true,
  mobile: true,
  preferPainelResponsavel: true,
});
assert.equal(jwtCoop.modo, "cooperado");
assert.equal(jwtCoop.staffPainelUi, false);

const expStaff = resolveExperienceUser(duplo, data);
assert.equal(expStaff?.role, "responsavel", "login responsável não vira cooperado");
const expCoop = resolveExperienceUser(coop, data);
assert.equal(expCoop?.role, "cooperado", "login cooperado não vira responsável");

console.log("ok: sem troca de painel responsável ↔ cooperado");
