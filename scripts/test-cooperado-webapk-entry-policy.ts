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

const chunkGuard = read("src/lib/pwa/chunkDplAlignGuard.ts");
assert.doesNotMatch(chunkGuard, /location\.replace\(next\)/, "chunk dpl nao redireciona cooperado");

const crash = read("src/lib/pwa/runtimeCrashForensics.ts");
assert.doesNotMatch(crash, /pwa-rescue\.html\?auto=1/, "crash forensics sem rescue automatico");

const ack = read("src/lib/pwa/pwaLoginHbPwaAckInline.ts");
assert.match(ack, /hb-pwa=/, "ack de reparo no login antes do guard");

const layout = read("src/app/layout.tsx");
assert.match(layout, /buildInlinePwaLoginHbPwaRepairAckScript/, "layout ack antes do guard");
assert.match(layout, /buildInlinePwaBrowserDetachServiceWorkerScript/, "layout detach SW no browser");

const loginPage = read("src/app/login/page.tsx");
assert.doesNotMatch(loginPage, /repairBrowserProfileIfStale/, "login sem purge/reload automático");

const manifest = buildWebAppManifest();
assert.ok(manifest.start_url.includes("/login") && manifest.start_url.includes("hb-pwa="), "manifest start_url login direto");
assert.ok(manifest.shortcuts[0].url.includes("pwa-launch.html"), "atalhos passam pelo launch");

console.log("OK test-cooperado-webapk-entry-policy");
