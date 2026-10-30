/**
 * Identidade multi cooperativa: CNPJ da sessão é canônico e tenants ambíguos falham fechados.
 */
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data.ts";
import type { AppData, User } from "../src/types";
import { getUserCooperativaId, resolveGestaoCooperativaId } from "../src/utils/cooperativa.ts";

const coopA = {
  id: "coop-a",
  nome: "Cooperativa A",
  cnpj: "62351750000165",
  status: "ativa",
  createdAt: "",
  updatedAt: "",
};
const coopB = {
  id: "coop-b",
  nome: "Cooperativa B",
  cnpj: "11222333000181",
  status: "ativa",
  createdAt: "",
  updatedAt: "",
};
const data = {
  ...emptyInitialData,
  cooperativas: [coopA, coopB],
  cooperados: [
    { id: "member-a", cooperativaId: coopA.id, status: "ativo" },
    { id: "member-b", cooperativaId: coopB.id, status: "ativo" },
  ],
} as unknown as AppData;

const staleLocalId = {
  id: "staff-b",
  name: "Responsável B",
  email: "staff-b@example.invalid",
  role: "responsavel",
  active: true,
  cooperativaId: coopA.id,
  cooperativaCnpj: "11.222.333/0001-81",
} as Omit<User, "password">;

assert.equal(getUserCooperativaId(staleLocalId, data), coopB.id);
assert.equal(resolveGestaoCooperativaId(staleLocalId, data), coopB.id);

const ambiguousStaff = {
  id: "staff-ambiguous",
  name: "Responsável sem vínculo",
  email: "staff-ambiguous@example.invalid",
  role: "responsavel",
  active: true,
} as Omit<User, "password">;
assert.equal(resolveGestaoCooperativaId(ambiguousStaff, data), undefined);

const singleTenantData = { ...data, cooperativas: [coopA] } as AppData;
assert.equal(resolveGestaoCooperativaId(ambiguousStaff, singleTenantData), coopA.id);

console.log("OK — CNPJ autenticado prevalece; tenant ambíguo não escolhe cooperativa arbitrariamente");
