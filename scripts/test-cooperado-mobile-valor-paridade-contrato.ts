/**
 * Mobile cooperado — valor exibido = motor BIC/AppData (não cache congelado).
 * npx tsx scripts/test-cooperado-mobile-valor-paridade-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 631, "build 631+ piloto paridade + Atualizar");

const hydrate = read("src/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate.ts");
assert.ok(hydrate.includes("cooperadoFinanceiroExibicaoDivergeDeAppDataLive"));
assert.match(
  hydrate,
  /cooperadoPwaFichaParidadeSnapshotDivergeDeAppData[\s\S]{0,120}return false/,
  "divergência ficha força rematerializar"
);
assert.match(
  hydrate,
  /cooperadoFinanceiroExibicaoDivergeDeAppDataLive[\s\S]{0,200}return false/,
  "card divergente não conta como materializado"
);

const recovery = read("src/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery.ts");
assert.ok(recovery.includes("cooperadoFinanceiroExibicaoDivergeDoMotorLocal"));

const hook = read("src/hooks/useCooperadoInicioValorReceberCardState.ts");
assert.ok(hook.includes("cacheDivergeMotorLive"));

const pilot = read("src/lib/cooperado/cooperadoMobilePilot.ts");
assert.ok(pilot.includes("cooperadoFinanceiroMobileLeituraAoVivo"));

const ficha = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.ok(ficha.includes("financeiroAppDataAoVivo"));

const unificado = read("src/lib/cooperado/cooperadoExibicaoFinanceiraUnificada.ts");
assert.ok(unificado.includes("COOPERADO_EXIBICAO_FINANCEIRA_UNIFICADA_AO_VIVO = false"));

const messenger = read("src/lib/cooperado/cooperadoPwaMessengerMode.ts");
assert.ok(messenger.includes('session?.role === "cooperado") return true'));

const inicioCtx = read("src/hooks/useCooperadoInicioCardContext.ts");
assert.ok(inicioCtx.includes("isCooperadoMobileGaPromoted(user) ? false"));

const dash = read("src/app/(app)/dashboard/DashboardContent.tsx");
assert.ok(dash.includes("cooperadoMotorAoVivo"));
assert.ok(dash.includes("leituraSomentePwa: cooperadoMotorAoVivo ? false"));

const sync = read("src/lib/cooperado/cooperadoInicioSincronizadoComFinanceiro.ts");
assert.ok(sync.includes("cooperadoCardInicioMotorParidadeFinanceiro"));
assert.ok(sync.includes("cooperadoLeituraFinanceiraExibicao"));
assert.ok(sync.includes("cooperadoApresentacaoFinanceiroUiCooperado"));

const unificada = read("src/lib/cooperado/cooperadoAReceberParidadeMobileUnificada.ts");
assert.ok(unificada.includes("cooperadoAReceberParidadeUnificadaPilotoJeferson"));
assert.ok(unificada.includes("cooperadoJefersonPilotoFinanceiroAtivo"));
assert.ok(unificada.includes("resolverParidadeCooperadoMobileExibicao"));
assert.ok(unificada.includes("inicioCardPersistido"));
assert.ok(unificada.includes("financeiroAutoritativo"));
assert.ok(unificada.includes("cooperadoAReceberFinanceiroAutoritativoPiloto"));
assert.ok(hook.includes("useCooperadoParidadeExibicaoJeferson"));
assert.ok(ficha.includes("useCooperadoParidadeExibicaoJeferson"));
const jefersonHook = read("src/hooks/useCooperadoParidadeExibicaoJeferson.ts");
assert.ok(jefersonHook.includes("lerParidadeExibicaoJefersonPiloto"));
assert.ok(jefersonHook.includes("resolverCooperadoIdCanonico"));
assert.ok(jefersonHook.includes("aplicarLastroLocalSeMotorZerou"));

assert.ok(hook.includes("cooperadoInicioSincronizadoComFinanceiro"));
assert.ok(ficha.includes("cooperadoInicioSincronizadoComFinanceiro(user)"));

console.log("OK — test-cooperado-mobile-valor-paridade-contrato");
