/**
 * Cooperado: sem atalho para responsável; A receber não grava zero na abertura.
 * npx tsx scripts/test-cooperado-inicio-sem-atalho-responsavel-v452.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import { cooperadoInicioCardEscolherDisplayEstavel } from "../src/lib/cooperadoInicioCardPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
assert.ok(APP_BUILD_VERSION >= 452);

const persistido = { mesLabel: "Out", valor: 180, valorRecibo: 0, aguardandoAssinatura: false };
const motorZero = { mesLabel: "—", valor: 0, valorRecibo: 0, aguardandoAssinatura: false };

assert.equal(
  cooperadoInicioCardEscolherDisplayEstavel({
    persistido,
    motor: motorZero,
    autorizaZerarCompleto: false,
  }).valor,
  180,
  "abertura com motor 0 incompleto mantém o A receber"
);

const hook = readFileSync(
  join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"),
  "utf8"
);
assert.ok(
  hook.includes("const atualizarManual = Boolean(input.syncing && isCooperadoUserSyncVisible())"),
  "zero só após Atualizar explícito"
);
assert.ok(
  /const motorZeradoComProva =\s*atualizarManual &&/.test(hook),
  "quitação na abertura não grava R$ 0"
);
assert.ok(
  hook.includes("persistido: persistidoMesmoBuildEarly"),
  "motor da abertura recebe o cache do A receber"
);
assert.ok(
  !hook.includes("omitirPersistido"),
  "não descarta o cache quando a apresentação consolida"
);

const bar = readFileSync(
  join(ROOT, "src/components/permissions/PainelResponsavelMobileBar.tsx"),
  "utf8"
);
assert.ok(!bar.includes("Ver como cooperado"), "sem atalho responsável → cooperado");
assert.ok(!bar.includes("Abrir painel responsável"), "sem atalho cooperado → responsável");

const drawer = readFileSync(join(ROOT, "src/permissions/index.ts"), "utf8");
assert.ok(
  drawer.includes("const jwtCooperado = normalizeUserRole(navSubject.role) === \"cooperado\""),
  "menu do cooperado não cai no menu da gestão"
);

const policy = readFileSync(join(ROOT, "src/lib/cooperadoInicioCardPolicy.ts"), "utf8");
assert.ok(
  !policy.includes("if (input.apresentacaoConsolidada && !financeiroCarregando) return null;"),
  "política do card não apaga o persistido na consolidação"
);

console.log("test-cooperado-inicio-sem-atalho-responsavel-v452: OK");
