/**
 * Arquivo local do responsável é por CNPJ — coop nova não herda nem apaga a casa.
 * npx tsx scripts/test-staff-gestao-persist-por-cnpj.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  APP_DATA_STORAGE_KEY,
  migrateLegacyAppDataIfMatches,
  readAppDataPersistRaw,
  removeAppDataPersistRaw,
  resolveAppDataStorageKey,
  staffGestaoNuncaGravaBlobGlobal,
  staffGestaoPersistKey,
  writeAppDataPersistRaw,
} from "../src/lib/staff/staffGestaoPersistKey.ts";

const CASA = "62351750000165";
const NOVA = "11222333000181";

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    dump: () => Object.fromEntries(m),
  };
}

const casa = {
  ...emptyInitialData,
  cooperativas: [{ id: "coop-casa", nome: "Casa", cnpj: CASA, status: "ativa" } as never],
  cooperados: [{ id: "c1", cooperativaId: "coop-casa", nomeCompleto: "Orlando", status: "ativo" } as never],
  notasPedido: [{ id: "n1", cooperativaId: "coop-casa" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop-casa", status: "pendente" } as never],
};

assert.equal(staffGestaoNuncaGravaBlobGlobal(), true);
assert.equal(staffGestaoPersistKey(CASA), `${APP_DATA_STORAGE_KEY}:${CASA}`);
assert.equal(resolveAppDataStorageKey({ role: "cooperado", cnpj: CASA }), APP_DATA_STORAGE_KEY);
assert.equal(resolveAppDataStorageKey({ role: "responsavel", cnpj: CASA }), staffGestaoPersistKey(CASA));

const legado = memStorage({ [APP_DATA_STORAGE_KEY]: JSON.stringify(casa) });
assert.ok(migrateLegacyAppDataIfMatches(CASA, legado), "casa herda o arquivo antigo");
assert.ok(legado.getItem(staffGestaoPersistKey(CASA)), "cópia da casa na chave do CNPJ");
assert.ok(legado.getItem(APP_DATA_STORAGE_KEY), "arquivo antigo da casa não é apagado");

const estrangeiro = memStorage({ [APP_DATA_STORAGE_KEY]: JSON.stringify(casa) });
assert.equal(migrateLegacyAppDataIfMatches(NOVA, estrangeiro), null, "coop nova não herda a casa");
assert.equal(estrangeiro.getItem(staffGestaoPersistKey(NOVA)), null);
assert.ok(estrangeiro.getItem(APP_DATA_STORAGE_KEY), "legado da casa permanece");

const staffNova = memStorage({ [APP_DATA_STORAGE_KEY]: JSON.stringify(casa) });
assert.equal(
  readAppDataPersistRaw({ role: "responsavel", cnpj: NOVA, storage: staffNova }),
  null,
  "responsável novo não lê o bloco da casa"
);
assert.ok(writeAppDataPersistRaw(JSON.stringify({ ...emptyInitialData }), { role: "responsavel", cnpj: NOVA, storage: staffNova }));
assert.ok(staffNova.getItem(APP_DATA_STORAGE_KEY)?.includes(CASA), "gravação da nova não pisa no legado");

const cooperado = memStorage({ [APP_DATA_STORAGE_KEY]: JSON.stringify(casa) });
const lidoCooperado = readAppDataPersistRaw({ role: "cooperado", cnpj: CASA, storage: cooperado });
assert.ok(lidoCooperado?.includes("Orlando"), "cooperado continua no arquivo de sempre");
assert.ok(
  writeAppDataPersistRaw(JSON.stringify({ ...emptyInitialData, cooperativas: casa.cooperativas }), {
    role: "cooperado",
    cnpj: CASA,
    storage: cooperado,
  }),
  "cooperado continua gravando no arquivo de sempre"
);

const staffSemCnpj = memStorage({ [APP_DATA_STORAGE_KEY]: JSON.stringify(casa) });
assert.equal(
  readAppDataPersistRaw({ role: "responsavel", cnpj: "", storage: staffSemCnpj }),
  null,
  "responsável sem CNPJ não lê o blob do cooperado"
);
assert.equal(
  writeAppDataPersistRaw(JSON.stringify({ ...emptyInitialData }), {
    role: "responsavel",
    cnpj: "",
    storage: staffSemCnpj,
  }),
  false,
  "responsável sem CNPJ não grava no blob global"
);
assert.ok(staffSemCnpj.getItem(APP_DATA_STORAGE_KEY)?.includes("Orlando"), "blob do cooperado intacto");
removeAppDataPersistRaw({ role: "responsavel", cnpj: "", storage: staffSemCnpj });
assert.ok(staffSemCnpj.getItem(APP_DATA_STORAGE_KEY)?.includes("Orlando"), "sem CNPJ não apaga o cooperado");

const store = readFileSync(join(import.meta.dirname ?? __dirname, "../src/services/dataStore.ts"), "utf8");
assert.match(store, /appDataPersistIo/);
assert.match(store, /readAppDataPersistRaw/);
assert.match(store, /writeAppDataPersistRaw/);
assert.match(store, /isAppDataPersistStorageKey/);

console.log("ok: arquivo local do responsável isolado por CNPJ");
