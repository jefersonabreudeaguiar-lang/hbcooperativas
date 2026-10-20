/**
 * PWA cooperado puxa só a ficha HB depois do paint — sem operacional cheio.
 * npx tsx scripts/test-hb-debito-ficha-silent-pwa.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ficha = read("src/lib/hb-credit/syncContaCoopFichaDescontos.ts");
const silentStart = ficha.indexOf("export async function puxarDebitoHbFichaDescontosSilentCooperado");
const silentEnd = ficha.indexOf("export async function refreshContaCoopDescontosAfterOperacionalSync");
assert.ok(silentStart >= 0 && silentEnd > silentStart, "puxarDebitoHbFichaDescontosSilentCooperado existe");
const silent = ficha.slice(silentStart, silentEnd);
assert.match(silent, /pushCloud:\s*false/, "silent não empurra operacional");
assert.doesNotMatch(silent, /pushOperacionalToCloud/, "silent sem push operacional");
assert.doesNotMatch(silent, /refreshContaCoopValorReceberPilot/, "silent sem bundle de warmup");
assert.doesNotMatch(silent, /refreshContaCoopLimiteFromFicha/, "silent sem sync-limite");
assert.match(silent, /applyLocalContaCoopDescontosRefresh/, "silent grava arquivo mensal local");
assert.match(silent, /refletirHbDebitoNoAReceberLocal/, "silent rematerializa A receber");
assert.match(silent, /isAppDataWarm/, "silent espera AppData já quente");

const warmup = read("src/hooks/useHbCreditDescontosWarmup.ts");
assert.match(warmup, /puxarDebitoHbFichaDescontosSilentCooperado/, "warmup mobile usa puxão silencioso");
assert.match(warmup, /scheduleCooperadoPostInteractiveTask/, "puxão só depois do paint/idle");
assert.match(
  warmup,
  /if \(user\.role === "cooperado" && isCooperadoManualOperacionalSync\(\)\) return;/,
  "warmup operacional continua desligado no PWA"
);
assert.doesNotMatch(warmup, /requestAppSync|operacional_full/, "warmup não puxa operacional cheio");
assert.match(
  warmup,
  /\}, \[user\?\.id, user\?\.role, user\?\.cooperadoId, user\?\.cooperativaId\]\);/,
  "puxão silencioso não depende da troca de aba"
);

console.log("test-hb-debito-ficha-silent-pwa.ts ok");
