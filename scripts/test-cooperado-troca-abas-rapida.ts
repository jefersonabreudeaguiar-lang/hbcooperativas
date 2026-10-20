/**
 * Troca de abas do cooperado — pinta na hora, trabalho pesado no idle.
 * npx tsx scripts/test-cooperado-troca-abas-rapida.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COOPERADO_TROCA_ABAS_RAPIDA_VERSION,
  COOPERADO_TROCA_ABAS_TRABALHO_PESADO_NO_IDLE,
  COOPERADO_TROCA_ABAS_USA_CACHE_KEEP_ALIVE,
} from "../src/lib/cooperado/cooperadoTrocaAbasRapida.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.equal(COOPERADO_TROCA_ABAS_RAPIDA_VERSION, 1);
assert.equal(COOPERADO_TROCA_ABAS_USA_CACHE_KEEP_ALIVE, true);
assert.equal(COOPERADO_TROCA_ABAS_TRABALHO_PESADO_NO_IDLE, true);

const ficha = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.doesNotMatch(
  ficha,
  /useLayoutEffect\(\(\) => \{\s*if \(!tabActive/,
  "Financeiro não parseia AppData no layout da troca de aba"
);
assert.match(
  ficha,
  /Já quente: não parsear nem forçar tick/,
  "Financeiro já quente não força tick na troca"
);
assert.match(
  ficha,
  /requestIdleCallback\(run, \{ timeout: 1_200 \}\)/,
  "sync do Financeiro só no idle depois da troca"
);

const dashboard = read("src/app/(app)/dashboard/DashboardContent.tsx");
assert.match(
  dashboard,
  /requestAnimationFrame\(\(\) => refreshPwaInicioView\(\)\)/,
  "Início relê o snapshot depois do paint da aba"
);

const fastPath = read("src/lib/performance/cooperadoPinnedTabFastPath.ts");
assert.match(
  fastPath,
  /if \(!cooperadoTabPanelCached\(targetHref\)\) return false;/,
  "troca instantânea se o destino já está em cache"
);
assert.match(
  fastPath,
  /setCooperadoOptimisticTab\(targetHref\)/,
  "URL otimista na troca"
);

const hook = read("src/hooks/useCooperadoInicioValorReceberCardState.ts");
assert.match(hook, /if \(!tabAtiva\)/, "A receber escondido usa cache — não trava a troca");

console.log("test-cooperado-troca-abas-rapida.ts ok");
