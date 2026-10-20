/**
 * Contrato — atualização do PWA do cooperado sem limpar cookie.
 * npx tsx scripts/test-cooperado-atualizacao-pwa-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COOPERADO_ATUALIZACAO_COLD_START_ENDED_TRIGGER,
  COOPERADO_ATUALIZACAO_PINTA_ANTES_DO_PROBE,
  COOPERADO_ATUALIZACAO_PRESERVA_SERVICE_WORKER,
  COOPERADO_ATUALIZACAO_PRESERVA_SESSAO,
  COOPERADO_ATUALIZACAO_PWA_CONTRATO_VERSION,
  COOPERADO_ATUALIZACAO_SEM_POLL_NAS_ABAS,
  COOPERADO_ATUALIZACAO_TROCA_HTML_UMA_VEZ,
} from "../src/lib/cooperado/cooperadoAtualizacaoPwaContrato.ts";

const root = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

assert.equal(COOPERADO_ATUALIZACAO_PWA_CONTRATO_VERSION, 1);
assert.equal(COOPERADO_ATUALIZACAO_PINTA_ANTES_DO_PROBE, true);
assert.equal(COOPERADO_ATUALIZACAO_TROCA_HTML_UMA_VEZ, true);
assert.equal(COOPERADO_ATUALIZACAO_PRESERVA_SERVICE_WORKER, true);
assert.equal(COOPERADO_ATUALIZACAO_PRESERVA_SESSAO, true);
assert.equal(COOPERADO_ATUALIZACAO_SEM_POLL_NAS_ABAS, true);
assert.equal(COOPERADO_ATUALIZACAO_COLD_START_ENDED_TRIGGER, "cold_start_ended");

const release = read("src/lib/pwa/clientRelease.ts");
assert.match(release, /preserveServiceWorker/);
assert.match(
  release,
  /preserveServiceWorker: shouldAutoAlignClientRelease\(\)/,
  "atalho instalado não desregistra o Service Worker no align"
);
assert.match(release, /await reg\?\.update\(\)/, "SW pede o script novo sem unregister");

const host = read("src/components/pwa/ClientReleaseShieldHost.tsx");
assert.match(host, /COOPERADO_ATUALIZACAO_COLD_START_ENDED_TRIGGER/);
assert.match(host, /PWA_COLD_START_SW_RELOAD_GRACE_MS/);
assert.doesNotMatch(host, /setInterval/, "sem polling de versão");
assert.doesNotMatch(host, /document\.cookie\s*=/, "não apaga cookie para atualizar");

const abertura = read("src/lib/cooperado/cooperadoAberturaInstantanea.ts");
assert.match(abertura, /COOPERADO_BOOT_SHELL_PINTA_INICIO_LOCAL/);

console.log("ok: contrato atualização PWA — troca HTML uma vez, preserva SW e sessão");
