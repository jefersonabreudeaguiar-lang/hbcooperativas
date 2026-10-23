/**
 * Contrato v546 — badge “desatualizado” não trava o cooperado com dados locais.
 * npx tsx scripts/test-cooperado-badge-desatualizado-v546.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cooperadoPwaDeveMostrarBadgeDesatualizado } from "../src/lib/cooperado/cooperadoPwaDadosFreshness.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const freshness = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoPwaDadosFreshness.ts"), "utf8");
const hydrate = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate.ts"), "utf8");
const gate = readFileSync(join(ROOT, "src/components/cooperado/CooperadoFinanceiroGate.tsx"), "utf8");
const recovery = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery.ts"), "utf8");
const fg = readFileSync(join(ROOT, "src/lib/performance/cooperadoForegroundOperacionalSync.ts"), "utf8");

assert.match(freshness, /temDadosFinanceirosLocais\) return false/);
assert.match(hydrate, /if \(data && cooperadoTemDadosFinanceirosMinimos\(data, canon, coopId\)\)/);
assert.match(gate, /scheduleCooperadoPostShellSync\(runFinanceBootstrap\);/);
assert.doesNotMatch(gate, /lastSyncedAt, syncingForUi\]/);
assert.match(recovery, /cooperadoTemDadosFinanceirosMinimos\(data, cooperadoId, coopId\)/);
assert.match(fg, /return null;/);

assert.equal(
  cooperadoPwaDeveMostrarBadgeDesatualizado({
    messenger: true,
    role: "cooperado",
    suppress: false,
    appDataWarm: false,
    temDadosFinanceirosLocais: false,
    snapshotsAusentes: true,
  }),
  false,
  "abertura fria não mostra desatualizado"
);

assert.equal(
  cooperadoPwaDeveMostrarBadgeDesatualizado({
    messenger: true,
    role: "cooperado",
    suppress: false,
    appDataWarm: true,
    temDadosFinanceirosLocais: true,
    snapshotsAusentes: true,
  }),
  false,
  "fatia local não alarma"
);

assert.equal(
  cooperadoPwaDeveMostrarBadgeDesatualizado({
    messenger: true,
    role: "cooperado",
    suppress: false,
    appDataWarm: true,
    temDadosFinanceirosLocais: false,
    snapshotsAusentes: true,
  }),
  true,
  "sem dados locais e sem snapshot — badge ok"
);

console.log("OK test-cooperado-badge-desatualizado-v546");
