/**
 * Etapa 1 — garantia GA não força nuvem com motor local (v549).
 * npx tsx scripts/test-cooperado-etapa1-garantia-v549.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const garantia = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoGaGarantiaValorReceberSync.ts"),
  "utf8"
);
const syncReq = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
const baseSync = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync.ts"),
  "utf8"
);

assert.doesNotMatch(garantia, /cooperadoPwaFichaParidadeSnapshotDivergeDeAppData/);
assert.match(garantia, /cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem\(user\)/);
assert.match(garantia, /rematerializarCooperadoPwaSnapshotsSeNecessario/);
assert.match(syncReq, /session\?\.role === "cooperado"\)[\s\S]{0,200}PrecisaRecoveryNuvem/);
assert.match(baseSync, /return cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem\(user\)/);
assert.doesNotMatch(baseSync, /cooperadoGaExibicaoFinanceiraAindaZerada/);

console.log("OK test-cooperado-etapa1-garantia-v549");
