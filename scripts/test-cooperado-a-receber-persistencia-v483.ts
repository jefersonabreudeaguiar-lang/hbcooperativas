/**
 * A receber persiste ao fechar o app; Financeiro tem seções.
 * npx tsx scripts/test-cooperado-a-receber-persistencia-v483.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gravarInicioCardPersistidoFlex,
  inicioCardStorageKey,
  lerInicioCardPersistidoFlexSemFiltroBuild,
} from "../src/lib/cooperadoInicioCardPersistencia.ts";
import { lerInicioCardFinanceiroExibicao } from "../src/lib/cooperado/cooperadoFinanceiroDisplayCache.ts";
import { cooperadoInicioCardEscolherDisplayEstavel } from "../src/lib/cooperadoInicioCardPolicy.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const hook = readFileSync(join(ROOT, "src/hooks/useCooperadoInicioValorReceberCardState.ts"), "utf8");
const persist = readFileSync(join(ROOT, "src/lib/cooperadoInicioCardPersistencia.ts"), "utf8");
const auth = readFileSync(join(ROOT, "src/modules/auth/AuthProvider.tsx"), "utf8");
const ficha = readFileSync(join(ROOT, "src/app/(app)/ficha-corrida/FichaCorridaContent.tsx"), "utf8");
const nav = readFileSync(join(ROOT, "src/components/cooperado/CooperadoFinanceiroSecoesNav.tsx"), "utf8");
const version = readFileSync(join(ROOT, "src/lib/appBuildVersion.ts"), "utf8");

assert.match(version, /APP_BUILD_VERSION = 483/, "build 483");
assert.match(hook, /lerInicioCardFinanceiroExibicao/, "hook lê cache HB-like");
assert.match(hook, /pagehide/, "grava ao fechar o app");
assert.match(hook, /visibilitychange/, "grava ao ir para segundo plano");
assert.match(persist, /cooperativaId\?\.trim\(\) \|\| "pending"/, "grava sem cooperativaId");
assert.doesNotMatch(auth, /purgarInicioCardValorReceberCooperado\(safeUser\)/, "login frio não apaga cache");
assert.match(ficha, /CooperadoFinanceiroSecoesNav/, "Financeiro com seções");
assert.match(nav, /Resumo/, "aba resumo");
assert.match(nav, /Ficha/, "aba ficha");
assert.match(nav, /HB Créditos/, "aba créditos");
assert.match(nav, /Fotos/, "aba fotos");

const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const display = { mesLabel: "Outubro 2026", valor: 1234.5, valorRecibo: 0, aguardandoAssinatura: false };
gravarInicioCardPersistidoFlex("c1", undefined, {
  v: 8,
  appBuild: 400,
  motorRevision: "t",
  display,
  savedAt: new Date().toISOString(),
});
assert.ok(store.has(inicioCardStorageKey("c1", "pending")), "chave pending");
const lido = lerInicioCardPersistidoFlexSemFiltroBuild("c1", undefined);
assert.ok(lido && lido.display.valor === 1234.5, "relê após fechar");
const exib = lerInicioCardFinanceiroExibicao("c1", undefined);
assert.ok(exib && exib.display.valor === 1234.5, "exibição usa cache");

const estavel = cooperadoInicioCardEscolherDisplayEstavel({
  persistido: display,
  motor: { mesLabel: "—", valor: 0, valorRecibo: 0, aguardandoAssinatura: false },
  autorizaZerarCompleto: false,
});
assert.equal(estavel.valor, 1234.5, "motor 0 não apaga persistido");

console.log("ok: a receber persiste; Financeiro em A receber / Ficha / HB / Fotos");
