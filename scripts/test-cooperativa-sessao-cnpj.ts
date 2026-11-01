import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import type { User, AppData } from "../src/types";
import { getUserCooperativaId } from "../src/utils/cooperativa";

const data = { ...emptyInitialData, cooperativas: [
  { id: "restaurada", cnpj: "62.351.750/0001-65", status: "ativa" },
  { id: "outra", cnpj: "00000000000191", status: "ativa" },
] } as AppData;
const user = { id: "responsavel", role: "responsavel", cooperativaId: "id-antigo", cooperativaCnpj: "62351750000165" } as User;
assert.equal(getUserCooperativaId(user, data), "restaurada", "CNPJ da sessão resolve o cadastro restaurado");
assert.equal(getUserCooperativaId({ ...user, cooperativaCnpj: undefined }, data), "id-antigo", "sem CNPJ mantém vínculo explícito");
assert.equal(getUserCooperativaId({ ...user, cooperativaId: undefined, cooperativaCnpj: "11111111111111" }, data), undefined, "não escolhe outra cooperativa arbitrariamente");
console.log("OK: vínculo restaurado por CNPJ; sessão sem correspondência não troca de cooperativa");
