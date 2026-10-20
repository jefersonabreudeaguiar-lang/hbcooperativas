/**
 * Gate passo 0 — contratos do campo + isolamento staff por CNPJ.
 * npm run gate:preservar-app
 *
 * Não altera dados nem UI. Se vermelho: freeze (docs/OPERACAO-HB-PLATAFORMA.md).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PRESERVAR_APP_DEBITO_BLOB_GLOBAL,
  PRESERVAR_APP_GATE_VERSION,
  PRESERVAR_APP_STAFF_LKG_POR_CNPJ,
  PRESERVAR_APP_STAFF_LKG_PREFIX,
  PRESERVAR_APP_STAFF_NUNCA_GRAVA_BLOB_GLOBAL,
  PRESERVAR_APP_TESTES_CONTRATO,
  listarDriftContratosTravados,
  misturaRaiosDeProduto,
  raioExplosaoDoDiff,
} from "../src/lib/plataforma/preservarAppCatalogo.ts";

const root = resolve(import.meta.dirname ?? __dirname, "..");

assert.equal(PRESERVAR_APP_GATE_VERSION, 1);
assert.equal(PRESERVAR_APP_STAFF_LKG_POR_CNPJ, true);
assert.equal(PRESERVAR_APP_STAFF_LKG_PREFIX, "hb-staff-gestao-lkg-v1");
assert.equal(PRESERVAR_APP_STAFF_NUNCA_GRAVA_BLOB_GLOBAL, true);
assert.equal(PRESERVAR_APP_DEBITO_BLOB_GLOBAL, "coopeagriplla_data");

const drifts = listarDriftContratosTravados();
assert.equal(
  drifts.length,
  0,
  `contrato drift (atualizar catálogo só com ordem explícita): ${JSON.stringify(drifts)}`
);

const passo0 = raioExplosaoDoDiff([
  "docs/OPERACAO-HB-PLATAFORMA.md",
  ".cursor/rules/plataforma-preservar-app.mdc",
  "src/lib/plataforma/preservarAppCatalogo.ts",
  "scripts/test-preservar-app-gate.ts",
  "package.json",
]);
assert.deepEqual([...passo0], ["docs"]);
assert.equal(misturaRaiosDeProduto(passo0), false);

const misturaProibida = raioExplosaoDoDiff([
  "src/lib/cooperado/cooperadoAberturaInstantanea.ts",
  "src/lib/responsavel/responsavelPagarCooperadosContrato.ts",
]);
assert.equal(misturaRaiosDeProduto(misturaProibida), true);

const lkg = readFileSync(join(root, "src/lib/staff/staffGestaoSnapshotGuard.ts"), "utf8");
assert.match(lkg, /hb-staff-gestao-lkg-v1/);
assert.match(lkg, /\$\{STAFF_GESTAO_LKG_SESSION_KEY\}:\$\{cnpj\}/);

const persist = readFileSync(join(root, "src/lib/staff/staffGestaoPersistKey.ts"), "utf8");
assert.match(persist, /\$\{APP_DATA_STORAGE_KEY\}:\$\{normalizeCnpj\(cnpj\)\}/);
assert.match(persist, /staffGestaoNuncaGravaBlobGlobal/);
assert.match(persist, /staffGestaoSemCnpj/);

const lei = readFileSync(join(root, "docs/OPERACAO-HB-PLATAFORMA.md"), "utf8");
assert.match(lei, /gate:preservar-app/);
assert.match(lei, /passo 0/i);

for (const rel of PRESERVAR_APP_TESTES_CONTRATO) {
  assert.equal(existsSync(join(root, rel)), true, `falta teste ${rel}`);
}

function runContrato(rel: string): void {
  console.log(`\n── preservar-app — ${rel}`);
  const r = spawnSync("npx", ["tsx", rel], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  assert.equal(r.status, 0, `falhou: ${rel}`);
}

for (const rel of PRESERVAR_APP_TESTES_CONTRATO) {
  runContrato(rel);
}

console.log("ok: gate preservar-app (passo 0) — contratos e isolamento por CNPJ intactos");
