/**
 * Responsável sem contrato vai a Contratos; coop com contrato e cooperado não.
 * npx tsx scripts/test-staff-primeiro-dia-contratos.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  isStaffPrimeiroDiaContratosVazio,
  shouldRedirectStaffPrimeiroDiaContratos,
  STAFF_PRIMEIRO_DIA_CONTRATOS_TITULO,
} from "../src/lib/staff/staffPrimeiroDiaContratos.ts";

const vazio = {
  ...emptyInitialData,
  instituicoes: [],
};

const comContrato = {
  ...emptyInitialData,
  instituicoes: [{ id: "i1", cooperativaId: "coop1", nome: "PNAE", tipo: "PNAE" } as never],
};

assert.equal(
  shouldRedirectStaffPrimeiroDiaContratos({
    role: "responsavel",
    coopId: "coop1",
    pathname: "/dashboard",
    data: vazio,
    warm: true,
  }),
  true
);

assert.equal(
  shouldRedirectStaffPrimeiroDiaContratos({
    role: "responsavel",
    coopId: "coop1",
    pathname: "/dashboard",
    data: comContrato,
    warm: true,
  }),
  false,
  "casa com contrato não é desviada"
);

assert.equal(
  shouldRedirectStaffPrimeiroDiaContratos({
    role: "cooperado",
    coopId: "coop1",
    pathname: "/dashboard",
    data: vazio,
    warm: true,
  }),
  false,
  "cooperado não entra"
);

assert.equal(
  shouldRedirectStaffPrimeiroDiaContratos({
    role: "responsavel",
    coopId: "coop1",
    pathname: "/notas-pedido",
    data: vazio,
    warm: false,
  }),
  false,
  "F5 sem dados aquecidos não desvia"
);

assert.equal(
  shouldRedirectStaffPrimeiroDiaContratos({
    role: "responsavel",
    coopId: "coop1",
    pathname: "/contratos",
    data: vazio,
    warm: true,
  }),
  false
);

const layout = readFileSync(join(import.meta.dirname ?? __dirname, "../src/components/layout/AppLayout.tsx"), "utf8");
assert.match(layout, /useStaffPrimeiroDiaContratos/);

const cadastro = readFileSync(join(import.meta.dirname ?? __dirname, "../src/app/cadastro/page.tsx"), "utf8");
assert.match(cadastro, /router\.push\("\/contratos"\)/);

assert.equal(
  isStaffPrimeiroDiaContratosVazio({
    role: "responsavel",
    coopId: "coop1",
    data: vazio,
    warm: true,
  }),
  true
);
assert.equal(
  isStaffPrimeiroDiaContratosVazio({
    role: "responsavel",
    coopId: "coop1",
    data: comContrato,
    warm: true,
  }),
  false,
  "casa com contrato não vê recado de primeiro dia"
);
assert.equal(
  isStaffPrimeiroDiaContratosVazio({
    role: "responsavel",
    coopId: "coop1",
    data: vazio,
    warm: false,
  }),
  false,
  "F5 sem dados aquecidos não mostra primeiro dia"
);

const contratosPage = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/app/(app)/contratos/page.tsx"),
  "utf8"
);
assert.match(contratosPage, /isStaffPrimeiroDiaContratosVazio/);
assert.match(contratosPage, /STAFF_PRIMEIRO_DIA_CONTRATOS_TITULO/);
assert.match(STAFF_PRIMEIRO_DIA_CONTRATOS_TITULO, /Primeiro dia/);

console.log("ok: primeiro dia do responsável vai a Contratos só se estiver vazio");
