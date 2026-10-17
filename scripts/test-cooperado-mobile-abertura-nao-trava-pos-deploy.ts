/**
 * Após bump de build, o celular não pode zerar cache nem puxar operacional_full na abertura.
 * npx tsx scripts/test-cooperado-mobile-abertura-nao-trava-pos-deploy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { cooperadoPwaSnapshotBuildReadable } from "../src/lib/cooperado/cooperadoPwaSnapshotBuildPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

assert.equal(cooperadoPwaSnapshotBuildReadable(APP_BUILD_VERSION), true);
assert.equal(cooperadoPwaSnapshotBuildReadable(APP_BUILD_VERSION - 1), true);
assert.equal(cooperadoPwaSnapshotBuildReadable(undefined), true);
assert.equal(cooperadoPwaSnapshotBuildReadable(APP_BUILD_VERSION - 49), false);

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

console.log("test-cooperado-mobile-abertura-nao-trava-pos-deploy: OK");
