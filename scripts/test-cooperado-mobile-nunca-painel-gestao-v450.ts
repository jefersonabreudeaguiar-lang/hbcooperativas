/**
 * Cooperado no celular nunca vê a área do responsável.
 * npx tsx scripts/test-cooperado-mobile-nunca-painel-gestao-v450.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import {
  cooperadoSessaoNuncaPainelGestaoMobile,
  evaluateResponsavelIdentidade,
} from "../src/lib/responsavel/responsavelIdentidade.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
assert.ok(APP_BUILD_VERSION >= 451);

const jwtCooperado = {
  id: "u1",
  email: "coop@teste.com",
  role: "cooperado" as const,
  cooperativaId: "coop1",
  cooperadoId: "c1",
  active: true,
};

assert.equal(cooperadoSessaoNuncaPainelGestaoMobile(jwtCooperado, true), true);
assert.equal(cooperadoSessaoNuncaPainelGestaoMobile(jwtCooperado, false), false);
assert.equal(
  cooperadoSessaoNuncaPainelGestaoMobile({ ...jwtCooperado, role: "responsavel" }, true),
  false
);

const comPreferencia = evaluateResponsavelIdentidade({
  accountUser: jwtCooperado,
  dataReady: false,
  mobile: true,
  preferPainelResponsavel: true,
});
assert.equal(comPreferencia.staffPainelUi, false);
assert.equal(comPreferencia.showAdminPainel, false);
assert.equal(comPreferencia.modo, "cooperado");

const semVinculo = evaluateResponsavelIdentidade({
  accountUser: { ...jwtCooperado, cooperadoId: undefined, mobileCooperadoId: undefined },
  dataReady: false,
  mobile: true,
  preferPainelResponsavel: true,
});
assert.equal(semVinculo.staffPainelUi, false);
assert.equal(semVinculo.modo, "cooperado");

const dashboard = readFileSync(
  join(ROOT, "src/app/(app)/dashboard/DashboardContent.tsx"),
  "utf8"
);
const gateIdx = dashboard.indexOf("cooperadoSessaoNuncaPainelGestaoMobile");
const staffIdx = dashboard.indexOf("painelAbertura.staffPainelUi || painelAbertura.showAdminPainel");
assert.ok(gateIdx > 0, "Início tem trava de JWT cooperado");
assert.ok(gateIdx < staffIdx, "trava do cooperado vem antes do painel staff");

const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
assert.ok(auth.includes('jwtRole === "cooperado"'));
assert.ok(auth.includes("resetCooperadoAposVazamentoPainelGestao"));

const reset = readFileSync(
  join(ROOT, "src/lib/cooperado/resetCooperadoAposVazamentoPainelGestao.ts"),
  "utf8"
);
assert.ok(reset.includes("window.location.replace(\"/dashboard\")"));
assert.ok(reset.includes("setPreferPainelResponsavelMobile(false)"));

const guard = readFileSync(
  join(ROOT, "src/components/permissions/GestaoAccessGuard.tsx"),
  "utf8"
);
assert.ok(guard.includes("resetCooperadoAposVazamentoPainelGestao"));

console.log("test-cooperado-mobile-nunca-painel-gestao-v450: OK");
