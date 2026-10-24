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

assert.ok(APP_BUILD_VERSION >= 618, "build 618+ piloto Jeferson financeiro ao vivo");

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

const contrato = read("src/lib/cooperado/cooperadoExperienciaJefersonGaContrato.ts");
assert.ok(contrato.includes("COOPERADO_GA_FINANCEIRO_TAB_APPDATA_AO_VIVO"));

console.log("OK — test-cooperado-mobile-valor-paridade-contrato");
