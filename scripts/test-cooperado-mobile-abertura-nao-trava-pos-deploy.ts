/**
 * Após bump de build, o celular não pode zerar cache nem puxar operacional_full na abertura.
 * npx tsx scripts/test-cooperado-mobile-abertura-nao-trava-pos-deploy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { cooperadoPwaSnapshotBuildReadable } from "../src/lib/cooperado/cooperadoPwaSnapshotBuildPolicy.ts";
import { cooperadoGaAberturaBloqueiaPullOperacionalNuvem } from "../src/lib/cooperado/cooperadoMobilePilot.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

assert.equal(cooperadoPwaSnapshotBuildReadable(APP_BUILD_VERSION), true);
assert.equal(cooperadoPwaSnapshotBuildReadable(APP_BUILD_VERSION - 1), true);
assert.equal(cooperadoPwaSnapshotBuildReadable(undefined), true);
assert.equal(cooperadoPwaSnapshotBuildReadable(APP_BUILD_VERSION - 49), false);

const cooperado = {
  id: "u1",
  role: "cooperado" as const,
  cooperadoId: "c1",
  cooperativaId: "coop1",
};

assert.equal(cooperadoGaAberturaBloqueiaPullOperacionalNuvem(cooperado), true);
assert.equal(
  cooperadoGaAberturaBloqueiaPullOperacionalNuvem(cooperado, { userInitiated: true }),
  false
);

const bootstrap = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaColdBootstrap.ts"), "utf8");
assert.equal(
  /if \(cooperadoAppReleaseNeedsOperacionalSync\(\)\) return true;/.test(bootstrap),
  false,
  "abertura não agenda operacional_full só porque o build mudou"
);

const syncPolicy = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaSyncPolicy.ts"), "utf8");
assert.equal(
  /if \(cooperadoAppReleaseNeedsOperacionalSync\(\)\) return false;/.test(syncPolicy),
  false,
  "deploy não libera operacional_full automático"
);

const recovery = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery.ts"),
  "utf8"
);
assert.equal(
  /if \(cooperadoAppReleaseNeedsOperacionalSync\(\)\) return (true|false);/.test(recovery),
  false,
  "exibição não fica indeterminada só por bump de build"
);

const forcePull = /scheduleCooperadoGaSyncBaseInformacoesFinanceiras\(\s*user,\s*\{\s*force:\s*true\s*\}\)/;

const gate = readFileSync(join(ROOT, "src/components/cooperado/CooperadoFinanceiroGate.tsx"), "utf8");
assert.equal(forcePull.test(gate), false, "Gate não força operacional na abertura");

const dashboard = readFileSync(join(ROOT, "src/app/(app)/dashboard/DashboardContent.tsx"), "utf8");
assert.equal(forcePull.test(dashboard), false, "Início não força operacional no 1º paint");

const bicSession = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoBicMobileSessionSync.ts"),
  "utf8"
);
assert.equal(
  /runCooperadoGaSyncBaseInformacoesFinanceiras/.test(bicSession),
  false,
  "BIC sessão não puxa operacional/notas no 1º segundo"
);
assert.ok(
  bicSession.includes("scheduleCooperadoHbCreditLimiteAndAccountWarmup"),
  "abertura BIC ainda aquece HB (GET account)"
);

const gaBase = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync.ts"),
  "utf8"
);
assert.ok(
  gaBase.includes("cooperadoGaAberturaBloqueiaPullOperacionalNuvem"),
  "pull operacional tem trava de abertura"
);

console.log("test-cooperado-mobile-abertura-nao-trava-pos-deploy: OK");
