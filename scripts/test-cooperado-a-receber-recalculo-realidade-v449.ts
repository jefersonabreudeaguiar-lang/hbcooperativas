/**
 * A receber: cache segura a tela; ficha quente atualiza a realidade.
 * npx tsx scripts/test-cooperado-a-receber-recalculo-realidade-v449.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { cooperadoInicioCardEscolherDisplayEstavel } from "../src/lib/cooperadoInicioCardPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

assert.ok(APP_BUILD_VERSION >= 449);

const persistido = { mesLabel: "Out", valor: 180, valorRecibo: 0, aguardandoAssinatura: false };
const motorNovo = { mesLabel: "Out", valor: 220, valorRecibo: 0, aguardandoAssinatura: false };
const motorZero = { mesLabel: "—", valor: 0, valorRecibo: 0, aguardandoAssinatura: false };

assert.equal(
  cooperadoInicioCardEscolherDisplayEstavel({
    persistido,
    motor: motorNovo,
    autorizaZerarCompleto: false,
  }).valor,
  220,
  "ficha com valor novo atualiza o A receber"
);
assert.equal(
  cooperadoInicioCardEscolherDisplayEstavel({
    persistido,
    motor: motorZero,
    autorizaZerarCompleto: false,
  }).valor,
  180,
  "motor 0 incompleto não apaga o A receber"
);
assert.equal(
  cooperadoInicioCardEscolherDisplayEstavel({
    persistido,
    motor: motorZero,
    autorizaZerarCompleto: true,
  }).valor,
  0,
  "quitação completa atualiza para zero"
);

const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8"
);
const gaWarm = hook.match(
  /const gaParidadeWarm =\s*tabAtiva &&\s*isCooperadoMobilePilotPerfActive\(\) &&\s*isAppDataWarm\(\) &&\s*Boolean\(input\.cooperadoId\);/
);
assert.ok(gaWarm, "AppData quente recalcula mesmo com cache do A receber");
assert.ok(
  hook.includes("gravarPersistencia: mudou") || hook.includes("gravarPersistencia: true"),
  "valor novo ou quitação comprovada grava o cache"
);

console.log("test-cooperado-a-receber-recalculo-realidade-v449: OK");
