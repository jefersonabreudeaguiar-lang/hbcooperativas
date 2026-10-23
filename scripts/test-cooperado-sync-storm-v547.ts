/**
 * Contrato v547 — sem tempestade de operacional_full com AppData local válido.
 * npx tsx scripts/test-cooperado-sync-storm-v547.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const recovery = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery.ts"), "utf8");
const refresh = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaFinanceiroExibicaoRefreshSchedule.ts"), "utf8");
const bootstrap = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaColdBootstrap.ts"), "utf8");
const hydrate = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate.ts"), "utf8");
const foreground = readFileSync(join(ROOT, "src/lib/performance/cooperadoForegroundOperacionalSync.ts"), "utf8");
const snapshotRefresh = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh.ts"), "utf8");

assert.match(recovery, /paridade\.valorLiquido > 0\.01 && cooperadoTemDadosFinanceirosMinimos/);
assert.doesNotMatch(
  recovery,
  /paridade\.valorLiquido > 0\.01 && !cooperadoFinanceiroCardCacheTemValor\(user\)\) \{\s*return false/
);
assert.match(refresh, /cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem\(user\)/);
assert.doesNotMatch(bootstrap, /cooperadoPwaFichaParidadeSnapshotDivergeDeAppData/);
assert.match(hydrate, /live\.valorLiquido > 0\.005/);
assert.match(foreground, /cooperadoFinanceiroStaleRecuperavelEmBackground/);
assert.match(foreground, /cooperadoTemDadosFinanceirosMinimos\(getData\(\), opts\.cooperadoId, opts\.cooperativaId\)/);
assert.match(snapshotRefresh, /persistOperacionalSyncedAppBuild\(\)/);

console.log("OK test-cooperado-sync-storm-v547");
