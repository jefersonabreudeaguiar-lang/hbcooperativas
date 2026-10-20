/**
 * Início do responsável da cooperativa ativa: primeiro dia só se ela ainda não tem contrato ou cooperado.
 * npx tsx scripts/test-staff-primeiro-dia-inicio.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  isStaffPrimeiroDiaInicio,
  STAFF_PRIMEIRO_DIA_CONTRATOS_HREF,
  STAFF_PRIMEIRO_DIA_INICIO_TITULO,
} from "../src/lib/staff/staffPrimeiroDiaContratos.ts";

const nova = {
  ...emptyInitialData,
  cooperativas: [{ id: "coop-nova", nome: "Nova", cnpj: "54821937000157", status: "ativa" } as never],
  instituicoes: [],
  cooperados: [],
};

const casa = {
  ...emptyInitialData,
  cooperativas: [
    { id: "coop-casa", nome: "CoopeagriPla", cnpj: "62351750000165", status: "ativa" } as never,
  ],
  instituicoes: [{ id: "i1", cooperativaId: "coop-casa", nome: "PNAE", tipo: "PNAE" } as never],
  cooperados: [{ id: "c1", cooperativaId: "coop-casa", nomeCompleto: "Orlando", status: "ativo" } as never],
};

assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-nova",
    data: nova,
    warm: true,
  }),
  true,
  "cooperativa nova vê o primeiro dia no Início"
);

assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-casa",
    data: casa,
    warm: true,
  }),
  false,
  "casa com contrato e cooperado não troca o Início"
);

const casaComLastro = {
  ...emptyInitialData,
  cooperativas: [
    { id: "coop-casa", nome: "CoopeagriPla", cnpj: "62351750000165", status: "ativa" } as never,
  ],
  instituicoes: [],
  cooperados: [],
  notasPedido: [{ id: "n1", cooperativaId: "coop-casa" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop-casa" } as never],
};
assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-casa",
    data: casaComLastro,
    warm: true,
  }),
  false,
  "responsável principal com lastro não perde o Início"
);

assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "cooperado",
    coopId: "coop-nova",
    data: nova,
    warm: true,
  }),
  false,
  "cooperado não entra"
);

assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-nova",
    data: nova,
    warm: false,
  }),
  false,
  "F5 sem dados aquecidos não troca o Início"
);

const novaComContrato = {
  ...nova,
  instituicoes: [{ id: "i-n", cooperativaId: "coop-nova", nome: "PNAE", tipo: "PNAE" } as never],
};
assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-nova",
    data: novaComContrato,
    warm: true,
  }),
  false,
  "já tem contrato: Início volta ao painel padrão"
);

const novaComCooperado = {
  ...nova,
  cooperados: [{ id: "c-n", cooperativaId: "coop-nova", nomeCompleto: "Teste", status: "ativo" } as never],
};
assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-nova",
    data: novaComCooperado,
    warm: true,
  }),
  false,
  "já tem cooperado: Início volta ao painel padrão"
);

assert.equal(
  isStaffPrimeiroDiaInicio({
    role: "responsavel",
    coopId: "coop-nova",
    data: casa,
    warm: true,
  }),
  true,
  "sessão na cooperativa nova não herda contrato/cooperado da casa"
);

const dashboard = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/app/(app)/dashboard/DashboardContent.tsx"),
  "utf8"
);
assert.match(dashboard, /function AdminDashboard/);
assert.match(dashboard, /isStaffPrimeiroDiaInicio/);
assert.match(dashboard, /STAFF_PRIMEIRO_DIA_INICIO_TITULO/);
assert.match(dashboard, /STAFF_PRIMEIRO_DIA_CONTRATOS_HREF/);
assert.match(dashboard, /primeiroDiaInicio &&/);
assert.match(dashboard, /RestoreOperacionalPanel/);
assert.equal(dashboard.includes("if (primeiroDiaInicio) {"), false, "primeiro dia não substitui o painel");
assert.match(STAFF_PRIMEIRO_DIA_INICIO_TITULO, /Primeiro dia/);
assert.equal(STAFF_PRIMEIRO_DIA_CONTRATOS_HREF, "/contratos");

console.log("ok: Início do responsável só entra em primeiro dia na cooperativa ativa");
