/**
 * Conferir: Chrome alinha produção + faixa ao vivo + sync ao abrir Em aberto.
 * Uso: npx tsx scripts/test-conferir-producao-ui-v461.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

assert.ok(APP_BUILD_VERSION >= 461, "build de produção da faixa ao vivo");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const release = read("src/lib/pwa/clientRelease.ts");
assert.match(
  release,
  /return typeof window !== "undefined"/,
  "Chrome e PWA alinham com a produção — não só o atalho instalado"
);
assert.ok(
  !release.includes("display-mode: standalone)") ||
    !/function shouldAutoAlignClientRelease[\s\S]{0,180}display-mode: standalone/.test(release),
  "shouldAutoAlign não fica preso em standalone"
);

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
assert.match(sw, /hb-coop-build-461/, "SW no mesmo build");

console.log("ok: conferir produção UI v461 — Chrome alinha e Em aberto sincroniza");
