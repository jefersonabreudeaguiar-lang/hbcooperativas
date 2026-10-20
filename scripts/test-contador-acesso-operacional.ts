/**
 * Contadora vê livro operacional, não vira responsável.
 * npx tsx scripts/test-contador-acesso-operacional.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  CONTADOR_ACESSO_OPERACIONAL_AVISO,
  CONTADOR_ACESSO_OPERACIONAL_CONTRATO_VERSION,
  CONTADOR_ACESSO_OPERACIONAL_ESCOPO,
} from "../src/lib/staff/contadorAcessoOperacionalContrato.ts";
import { can, canUser, getMenuItems, resolveAppUserRole } from "../src/permissions/index.ts";
import { criarContadorEquipe } from "../src/services/equipeService.ts";
import { canSessionManageEquipe } from "../src/lib/security/staffProvisioningPolicy.ts";
import { requireNotContadorWrite } from "../src/lib/security/apiGuard.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

assert.equal(CONTADOR_ACESSO_OPERACIONAL_CONTRATO_VERSION, 1);
assert.match(CONTADOR_ACESSO_OPERACIONAL_AVISO, /não é demonstração contábil oficial/i);
assert.match(CONTADOR_ACESSO_OPERACIONAL_ESCOPO, /sem Conferir, Pagar/i);

for (const action of ["create", "edit", "delete", "approve"] as const) {
  assert.equal(can("contador", "notas_pedido", action), false, `contador não ${action} entregas`);
  assert.equal(can("contador", "ficha_corrida", action), false, `contador não ${action} ficha`);
}
assert.equal(can("contador", "contador", "view"), true);
assert.equal(can("contador", "relatorios", "export"), true);

const data = {
  ...emptyInitialData,
  cooperativas: [
    { id: "coop-casa", nome: "Casa", cnpj: "62351750000165", createdAt: "", updatedAt: "" },
  ],
  users: [],
};
const criado = criarContadorEquipe(
  data,
  { id: "u_resp", name: "Resp" },
  "coop-casa",
  "62351750000165",
  { name: "Contadora OCB", email: "contadora.ocb@example.com", password: "senha12", funcao: "Contadora OCB" }
);
assert.equal(criado.ok, true);
if (!criado.ok) throw new Error(criado.error);
assert.equal(criado.user.role, "contador");
assert.equal(criado.user.responsavelPrincipal, false);
assert.equal(criado.user.cooperativaId, "coop-casa");

const session = {
  id: criado.user.id,
  email: criado.user.email,
  role: "contador" as const,
  cooperativaId: "coop-casa",
  active: true,
};
assert.equal(resolveAppUserRole(session, { ...data, users: [criado.user] }), "contador");
assert.equal(resolveAppUserRole(session, null), "contador", "JWT contador não vira responsável");

const menu = getMenuItems(criado.user, false, false, { ...data, users: [criado.user] });
assert.equal(
  menu.some((i) => i.href.includes("notas-pedido") || i.href.includes("ficha-corrida")),
  false,
  "menu da contadora sem Conferir nem Pagar"
);
assert.equal(
  menu.some((i) => i.label === "Pagar" || i.label === "Conferir"),
  false,
  "rótulos de operação não aparecem"
);
assert.ok(menu.some((i) => i.href.includes("/contador/dashboard")), "menu tem Central do Contador");

assert.equal(canSessionManageEquipe(session), false, "contadora não gerencia equipe");
assert.equal(canUser(criado.user, "notas_pedido", "create"), false);

const writeBlock = requireNotContadorWrite(session, true);
assert.ok(writeBlock, "API bloqueia escrita da contadora");

for (const rel of [
  "src/app/(app)/contador/dashboard/page.tsx",
  "src/components/equipe/EquipeContadorPanel.tsx",
  "src/app/(app)/contador/parecer/page.tsx",
]) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert.match(src, /CONTADOR_ACESSO_OPERACIONAL_AVISO/, `${rel} mostra o aviso honesto`);
}

console.log("ok: acesso operacional da contadora — leitura, aviso, não vira responsável");
