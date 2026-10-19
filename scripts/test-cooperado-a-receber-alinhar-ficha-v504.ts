/**
 * Card A receber persiste; se a ficha for maior, o card atualiza sem zerar.
 * npx tsx scripts/test-cooperado-a-receber-alinhar-ficha-v504.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cooperadoInicioCardAlinharValorFicha } from "../src/lib/cooperadoInicioCardPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const hook = readFileSync(join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"), "utf8");
const persist = readFileSync(
  join(ROOT, "src/services/cooperadoInicioCardPersistenciaService.ts"),
  "utf8"
);
const fg = readFileSync(
  join(ROOT, "src/lib/performance/cooperadoForegroundOperacionalSync.ts"),
  "utf8"
);

assert.match(hook, /cooperadoInicioCardAlinharValorFicha/, "Início alinha card com ficha");
assert.match(persist, /cooperadoInicioCardAlinharValorFicha/, "grava card com valor da ficha");
assert.doesNotMatch(
  fg,
  /if \(cooperadoGaDeferForegroundRevisionChecks\(session\)\) return false;/,
  "abertura não bloqueia pull leve da ficha"
);

const persistido = {
  mesLabel: "Outubro 2026",
  valor: 80,
  valorRecibo: 0,
  aguardandoAssinatura: false,
};

const subiu = cooperadoInicioCardAlinharValorFicha(persistido, 150, "Outubro 2026");
assert.equal(subiu?.valor, 150, "ficha maior atualiza o card");
assert.equal(subiu?.mesLabel, "Outubro 2026", "mantém o mês");

const mesmo = cooperadoInicioCardAlinharValorFicha(persistido, 80, "Outubro 2026");
assert.equal(mesmo?.valor, 80, "ficha igual mantém o card");

const fichaZero = cooperadoInicioCardAlinharValorFicha(persistido, 0, "Outubro 2026");
assert.equal(fichaZero?.valor, 80, "ficha 0 não apaga o card");

console.log("ok: a receber persiste e sobe com a ficha");
