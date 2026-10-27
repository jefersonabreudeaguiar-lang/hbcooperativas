/**
 * WebAPK — guard replaceOnce (fix 350) + pwa-launch sem purge na abertura.
 * npx tsx scripts/test-cooperado-webapk-entry-policy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWebAppManifest } from "../src/lib/pwa/webAppManifest.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const guard = read("src/lib/pwa/pwaStandaloneLaunchGuardInline.ts");
assert.match(guard, /function replaceOnce\(url\)/, "guard WebAPK replaceOnce");
assert.doesNotMatch(guard, /aggressivePurge/, "guard não purga SW no ícone");
assert.match(guard, /if\(buildOk&&path\.indexOf\("\/login"\)>=0\)return/, "login com build ok não volta ao launch");
assert.match(guard, /pwa-launch\.html\?next=/, "atalho passa pelo launch");

const launch = read("public/pwa-launch.html");
assert.match(launch, /if \(!forcePurge\)/, "launch sem purge por padrão");

const ack = read("src/lib/pwa/pwaLoginHbPwaAckInline.ts");
assert.match(ack, /hb-pwa=/, "ack de reparo no login antes do guard");

const layout = read("src/app/layout.tsx");
assert.match(layout, /buildInlinePwaLoginHbPwaRepairAckScript/, "layout ack antes do guard");

const manifest = buildWebAppManifest();
assert.ok(manifest.start_url.includes("pwa-launch.html"), "manifest start_url via launch");

console.log("OK test-cooperado-webapk-entry-policy");
