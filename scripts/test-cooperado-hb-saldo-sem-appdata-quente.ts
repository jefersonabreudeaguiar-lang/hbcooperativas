/**
 * O valor HB do cooperado não pode depender de AppData quente na abertura.
 * npx tsx scripts/test-cooperado-hb-saldo-sem-appdata-quente.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCooperadoHbCreditCnpjDigits } from "../src/lib/hb-credit/resolveCooperadoHbCreditCnpj.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const userComCnpj = {
  id: "u1",
  role: "cooperado" as const,
  cooperadoId: "c1",
  cooperativaId: "coop1",
  cooperativaCnpj: "12.345.678/0001-90",
  name: "T",
  email: "t@t.com",
};

assert.equal(
  resolveCooperadoHbCreditCnpjDigits(userComCnpj),
  "12345678000190",
  "CNPJ da sessão basta — sem AppData"
);
assert.equal(
  resolveCooperadoHbCreditCnpjDigits({ ...userComCnpj, cooperativaCnpj: undefined }),
  "",
  "sem sessão/cache/AppData o resolver não inventa CNPJ"
);

const persistir = readFileSync(
  join(ROOT, "src/services/hbCreditAccountPersistenciaService.ts"),
  "utf8"
);
assert.ok(
  persistir.includes("resolveCooperadoHbCreditCnpjDigits"),
  "persistir resolve CNPJ da sessão/cache antes de esperar AppData"
);
assert.match(
  persistir,
  /const imediato = resolveCooperadoHbCreditCnpjDigits\(user\);\s*if \(imediato\.length === 14\) return imediato;/,
  "GET imediato quando a sessão já tem CNPJ"
);

const pipeline = readFileSync(
  join(ROOT, "src/lib/cooperado/cooperadoHbCreditSyncPadrao.ts"),
  "utf8"
);
assert.equal(
  /if \(!isAppDataWarm\(\)\) return false;/.test(pipeline),
  false,
  "pipeline não aborta o GET HB se AppData estiver frio"
);
const persistIdx = pipeline.indexOf("persistirHbCreditAccountCooperado(user");
const warmAbortIdx = pipeline.indexOf("if (!isAppDataWarm())");
assert.ok(persistIdx > 0, "pipeline chama persistir");
assert.ok(
  persistIdx < warmAbortIdx || warmAbortIdx === -1,
  "GET da conta vem antes de qualquer ramo de AppData"
);

const card = readFileSync(
  join(ROOT, "src/components/hb-credit/CooperadoHbCreditResumoCard.tsx"),
  "utf8"
);
assert.equal(
  /if \(!hbApiCooperadoId \|\| cnpj\.length !== 14\)/.test(card),
  false,
  "card não some o GET só porque o pai passou CNPJ vazio"
);
assert.ok(
  card.includes("persistirHbCreditAccountCooperado(user)"),
  "card busca a conta mesmo sem CNPJ do Início"
);
assert.ok(card.includes("lerHbCreditAccountPersistidoFlex"));

const hub = readFileSync(
  join(ROOT, "src/app/(app)/minha-conta-coop/MinhaContaCoopContent.tsx"),
  "utf8"
);
assert.equal(
  hub.includes("refreshContaCoopLimiteFromFicha"),
  false,
  "hub não reescreve o limite liberado a partir da ficha"
);

console.log("test-cooperado-hb-saldo-sem-appdata-quente: OK");
