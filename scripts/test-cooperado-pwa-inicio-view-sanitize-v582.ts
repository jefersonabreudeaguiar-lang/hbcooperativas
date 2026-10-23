/**
 * v582 — snapshot PWA incompleto (só nome) não pode derrubar o Início cooperado.
 */
import assert from "node:assert/strict";
import { formatMesReferencia } from "../src/utils/format";
import {
  sanitizeCooperadoPwaInicioDashboardView,
  type CooperadoPwaInicioDashboardView,
} from "../src/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";

const partial = {
  cooperadoId: "c_test",
  cooperado: {
    id: "c_test",
    cooperativaId: "coop1",
    nomeCompleto: "Maria da Silva",
    cpfCnpj: "",
    telefone: "",
    endereco: "",
    status: "ativo",
    produtos: [],
  },
} as CooperadoPwaInicioDashboardView;

assert.throws(() => formatMesReferencia(undefined as unknown as string));

const safe = sanitizeCooperadoPwaInicioDashboardView(partial);
assert(safe, "deve normalizar snapshot parcial");
assert(/^\d{4}-\d{2}$/.test(safe.mes), "mes válido");
assert(Array.isArray(safe.pautasAbertas));
assert(Array.isArray(safe.rejeitadas));
assert(typeof safe.coopNome === "string");
assert.doesNotThrow(() => formatMesReferencia(safe.mes));

assert.equal(sanitizeCooperadoPwaInicioDashboardView(null), null);
assert.equal(sanitizeCooperadoPwaInicioDashboardView({ cooperadoId: "" } as CooperadoPwaInicioDashboardView), null);

console.log("test-cooperado-pwa-inicio-view-sanitize-v582: OK");
