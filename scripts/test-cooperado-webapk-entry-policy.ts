/**
 * WebAPK — sem purge/replace destrutivo automático (causa "This page couldn't load").
 * npx tsx scripts/test-cooperado-webapk-entry-policy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWebAppManifest } from "../src/lib/pwa/webAppManifest.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const chunk = read("src/lib/pwa/chunkDplAlignGuard.ts");
assert.match(chunk, /hbCoopNoteWebApkChunkMismatch/, "chunk guard marca mismatch no ícone");
assert.doesNotMatch(chunk, /hbCoopSilentPwaPurge\(\);location\.replace/, "chunk guard não purga no ícone");

const silent = read("src/lib/pwa/cooperadoPwaSilentRepairInline.ts");
assert.match(silent, /if\(hbCoopStandalonePwa\(\)\)return/, "purge silencioso desligado no WebAPK");
assert.match(silent, /if\(hbCoopStandalonePwa\(\)\)\{go\(\);return;\}/, "purgeThen só navega no ícone");

const align = read("src/lib/pwa/htmlDeploymentAlign.ts");
assert.match(align, /if\(hbCoopStandalonePwa\(\)\)return/, "align html não roda no ícone");

const manifest = buildWebAppManifest();
assert.ok(manifest.start_url.includes("/login?hb-pwa="), "manifest abre login direto");
assert.ok(!manifest.start_url.includes("pwa-launch"), "manifest não usa pwa-launch no start_url");

const crash = read("src/lib/pwa/runtimeCrashForensics.ts");
assert.match(crash, /standalone.*maybeRescueCooperado|maybeRescueCooperado[\s\S]*standalone/, "TDZ não manda rescue auto no ícone");

console.log("OK test-cooperado-webapk-entry-policy");
