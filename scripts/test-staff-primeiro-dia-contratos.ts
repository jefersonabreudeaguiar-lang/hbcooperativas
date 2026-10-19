/**
 * Responsável sem contrato vai a Contratos; coop com contrato e cooperado não.
 * npx tsx scripts/test-staff-primeiro-dia-contratos.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import { shouldRedirectStaffPrimeiroDiaContratos } from "../src/lib/staff/staffPrimeiroDiaContratos.ts";

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

console.log("ok: primeiro dia do responsável vai a Contratos só se estiver vazio");
