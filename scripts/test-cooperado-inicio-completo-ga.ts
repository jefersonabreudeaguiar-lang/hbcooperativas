/**
 * GA mobile: Início somente casca — sem viewLive nem snapshot pesado na abertura.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dash = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/app/(app)/dashboard/DashboardContent.tsx"),
  "utf8"
);

assert.match(dash, /gaInicioSomenteCasca/);
assert.match(
  dash,
  /const viewUi = gaInicioSomenteCasca\s*\?\s*null/
);
assert.match(
  dash,
  /cooperadoMotorAoVivo\) \{\s*setViewLive\(null\)/,
  "GA não monta viewLive"
);

const pilot = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/lib/cooperado/cooperadoMobilePilot.ts"),
  "utf8"
);
assert.match(pilot, /cooperadoGaInicioSomenteCasca/);
assert.match(pilot, /cooperadoGaMobilePostergarAppDataWarm/);

const quiet = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/lib/cooperado/cooperadoInicioAberturaQuiescence.ts"),
  "utf8"
);
assert.match(quiet, /COOPERADO_INICIO_ABERTURA_QUIET_MS_MOBILE_GA/);

const dataStore = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/services/dataStore.ts"),
  "utf8"
);
assert.match(dataStore, /cooperadoGaShouldDeferDataWarmFromGetData/);

const snap = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "src/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh.ts"),
  "utf8"
);
assert.match(snap, /skipInicioDashboardView/);

console.log("OK test-cooperado-inicio-completo-ga");
