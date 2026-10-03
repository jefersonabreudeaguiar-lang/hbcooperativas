/**
 * HXHÍBRIDO 7.2 — fetchNotaFotoPartBlobUrl / planNotaFotoPartFetch
 * npx tsx scripts/test-nota-foto-part-fetch-h726.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countPlannedFotoPartFetchAttempts,
  planNotaFotoPartFetch,
} from "../src/services/notaFotoPartFetchPlan.ts";

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

const serviceSrc = readFileSync(join(ROOT, "src/services/notaPedidoCloudService.ts"), "utf8");

assert(
  !serviceSrc.includes("for (let i = 0; i < 8"),
  "E) sem loop 0..7 em fetchNotaFotoPartBlobUrl"
);
assert(
  !serviceSrc.includes("tryIndices"),
  "E) sem array tryIndices"
);
assert(serviceSrc.includes("planNotaFotoPartFetch"), "fetch usa planNotaFotoPartFetch");

// A/B/C — índice solicitado é o único fetch planejado
for (const idx of [0, 1, 2]) {
  const p = planNotaFotoPartFetch(idx, { partCount: 3 });
  assert(p.action === "fetch" && p.index === idx, `A/B/C) índice ${idx} → fetch parte ${idx}`);
}

// D — índice inexistente não busca parte 0
const out = planNotaFotoPartFetch(2, { partCount: 2 });
assert(out.action === "skip" && out.reason === "out_of_range", "D) índice 2 com partCount=2 → skip");

// E — 404: no plano só 1 tentativa; após falha não há segunda
assert(countPlannedFotoPartFetchAttempts(1, { partCount: 3 }) === 1, "E) no máximo 1 tentativa planejada");

// F — nota única foto
assert(
  countPlannedFotoPartFetchAttempts(0, { partCount: 1 }) === 1,
  "F) uma foto → 1 tentativa no índice 0"
);
assert(
  countPlannedFotoPartFetchAttempts(1, { partCount: 1 }) === 0,
  "F) uma foto → índice 1 não tenta (nem parte 0)"
);

// G — multipartes
assert(
  countPlannedFotoPartFetchAttempts(0, { partCount: 4 }) === 1 &&
    countPlannedFotoPartFetchAttempts(3, { partCount: 4 }) === 1,
  "G) multipartes: cada índice válido = 1 tentativa"
);

// H — legado sem partCount: ainda 1 tentativa só no índice pedido (nunca substitui)
const legacy = planNotaFotoPartFetch(1, {});
assert(legacy.action === "fetch" && legacy.index === 1, "H) sem partCount → tenta só índice 1");
assert(
  countPlannedFotoPartFetchAttempts(1, {}) === 1,
  "H) sem metadado → não expande para 0..7"
);

// Antes × depois (modelo de requests por chamada à função)
const beforeMaxAttempts = 8;
const afterMaxAttempts = 1;
console.log("\n--- Medição (modelo por chamada fetchNotaFotoPartBlobUrl) ---");
console.log(`Requests máx. antes (índice falha): até ${beforeMaxAttempts}`);
console.log(`Requests máx. depois (índice falha): ${afterMaxAttempts}`);
console.log("Tentativas em 404: antes até 8 sequenciais; depois 1");
console.log("Latência: antes ~8× RTT HTTP no pior caso; depois 1× RTT");

console.log("\nHXHÍBRIDO 7.2 testes OK");
