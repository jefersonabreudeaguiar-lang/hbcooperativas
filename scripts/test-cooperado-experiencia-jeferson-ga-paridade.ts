/**
 * Cooperado GA — mesma experiência mobile que Jeferson (sem fork de e-mail).
 * npx tsx scripts/test-cooperado-experiencia-jeferson-ga-paridade.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COOPERADO_EXPERIENCIA_JEFERSON_GA_VERSION,
  COOPERADO_GA_EMPACOTAR_AGUARDA_APPDATA,
  COOPERADO_GA_FINANCE_RECOVERY_REPETE_SE_ZERADO,
  COOPERADO_GA_USA_EMPACOTAR_MODELO_APARELHO,
} from "../src/lib/cooperado/cooperadoExperienciaJefersonGaContrato.ts";
import { isCooperadoMobileGaPromoted, isCooperadoMobileExperienciaJeferson } from "../src/lib/cooperado/cooperadoMobilePilot.ts";
import type { User } from "../src/types/index.ts";

assert.equal(COOPERADO_EXPERIENCIA_JEFERSON_GA_VERSION, 1);
assert.equal(COOPERADO_GA_USA_EMPACOTAR_MODELO_APARELHO, true);
assert.equal(COOPERADO_GA_EMPACOTAR_AGUARDA_APPDATA, true);
assert.equal(COOPERADO_GA_FINANCE_RECOVERY_REPETE_SE_ZERADO, true);

const cooperadoGenerico: User = {
  id: "u_orlando",
  email: "orlando@test.com",
  role: "cooperado",
  cooperadoId: "c_1782263929381_ncp55",
  cooperativaId: "coop-x",
  active: true,
  passwordHash: "",
  createdAt: "",
  updatedAt: "",
};

assert.equal(isCooperadoMobileGaPromoted(cooperadoGenerico), true);
assert.equal(isCooperadoMobileExperienciaJeferson(cooperadoGenerico), true);

const root = join(import.meta.dirname ?? __dirname, "..");
const pacote = readFileSync(join(root, "src/lib/cooperado/cooperadoAparelhoJefersonPacote.ts"), "utf8");
assert.match(pacote, /waitForAppDataWarm[\s\S]{0,120}empacotarModeloAparelhoJeferson/, "empacota após AppData");

const recovery = readFileSync(
  join(root, "src/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery.ts"),
  "utf8"
);
assert.match(recovery, /clearCooperadoFinanceReadRecoverySession/, "recovery pode repetir");
assert.doesNotMatch(
  recovery,
  /maybeCloudRecovery[\s\S]{0,280}markFinanceRecoverySession\(user\.id\);\s*\n\s*\};\s*$/,
  "nuvem não marca sessão antes de resolver"
);

const warmup = readFileSync(join(root, "src/lib/cooperado/cooperadoFinanceiroDisplayWarmup.ts"), "utf8");
assert.match(
  warmup,
  /cooperadoGaValorReceberExibicaoResolvida[\s\S]{0,80}markFinanceWarmupSession/,
  "warmup só marca sessão com valor resolvido"
);

console.log("ok: cooperado GA — paridade experiência Jeferson (mobile financeiro)");
