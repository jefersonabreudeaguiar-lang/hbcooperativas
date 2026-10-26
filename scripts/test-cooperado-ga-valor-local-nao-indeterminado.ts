/**
 * GA: com fatia financeira local e valor > 0, não prender card em indeterminado.
 * npx tsx scripts/test-cooperado-ga-valor-local-nao-indeterminado.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const recovery = readFileSync(
  resolve("src/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery.ts"),
  "utf8"
);
assert.match(
  recovery,
  /cooperadoTemDadosFinanceirosMinimos\(data, cooperadoId, coopId\)\) return true/,
  "valor local com fatia mínima resolve exibição"
);
console.log("OK test-cooperado-ga-valor-local-nao-indeterminado");
