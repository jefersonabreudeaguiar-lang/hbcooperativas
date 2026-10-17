/**
 * Conferir: Chrome alinha produção + faixa ao vivo + sync ao abrir Em aberto.
 * Uso: npx tsx scripts/test-conferir-producao-ui-v461.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

assert.ok(APP_BUILD_VERSION >= 462, "build depois do hotfix da tela branca");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const release = read("src/lib/pwa/clientRelease.ts");
assert.match(
  /function shouldAutoAlignClientRelease[\s\S]{0,280}display-mode: standalone/.test(release)
    ? "ok"
    : "",
  /^ok$/,
  "Chrome do responsável não dá hard-reload sozinho (só PWA)"
);
const chunkGuard = read("src/lib/pwa/chunkDplAlignGuard.ts");
assert.match(chunkGuard, /if\(!standalone\(\)\)return/, "chunk dpl não manda o browser para pwa-launch");

const staffApp = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
assert.match(staffApp, /StaffConferirProducaoBar/, "faixa ao vivo no Conferir");
assert.match(
  staffApp,
  /resetResponsavelPainelIndexCache\(\);\s*requestAppSyncImmediate\(\);/,
  "abrir Em aberto zera lastro e puxa PIX da nuvem"
);

const bar = read("src/components/conferir/StaffConferirProducaoBar.tsx");
assert.match(bar, /Ao vivo produção/, "texto de prova na UI");
assert.match(bar, /requestManualCooperadoReleaseUpgrade/, "botão recarrega o build publicado");

const atualizar = read("src/components/sync/SyncStatusChip.tsx");
assert.match(
  atualizar,
  /requestManualCooperadoReleaseUpgrade/,
  "Atualizar do responsável também puxa o JS novo"
);

const sw = read("public/sw.js");
assert.match(sw, new RegExp(`hb-coop-build-${APP_BUILD_VERSION}`), "SW no mesmo build");

console.log(`ok: conferir v${APP_BUILD_VERSION} — Chrome do responsável sem reload automático`);
