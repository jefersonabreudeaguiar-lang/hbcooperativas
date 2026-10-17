/**
 * Regressão painel responsável — contrato v1 (shell cold, dashboard, perfil duplo).
 * Uso: npx tsx scripts/test-responsavel-painel-regression.ts
 */
import assert from "node:assert/strict";
import type { AppData, User } from "../src/types/index.ts";
import {
  assertStaffColdShellMenusValid,
  evaluateResponsavelPainelAbertura,
  RESPONSAVEL_PAINEL_CONTRATO_VERSION,
  shouldPrioritizeStaffColdShell,
  staffShellMenusBeforeDataWarm,
} from "../src/lib/responsavel/responsavelPainelContrato.ts";
import { resolveAppUserRole } from "../src/permissions/index.ts";
import {
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
  resolveAuthoritativePanelRole,
} from "../src/lib/security/responsavelPanelAccess.ts";
import { shouldRenderStaffPainelUi } from "../src/lib/staffNavigationUser.ts";

const COOP = "coop-1";

function emptyData(users: User[]): AppData {
  return {
    users,
    cooperativas: [{ id: COOP, nome: "Coop Test", cnpj: "12345678000199", active: true }],
    cooperados: [],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    cotas: [],
    financeiroMensal: [],
    auditLog: [],
    equipe: [],
    comunicados: [],
    votacoes: [],
    prestacaoContas: [],
    contratos: [],
    instituicoes: [],
    propriedades: [],
    veiculos: [],
    descontos: [],
    valoresAvulsos: [],
    fechamentosMensais: [],
  } as AppData;
}

function staffUser(overrides: Partial<User> = {}): User {
  return {
    id: "u-resp",
    email: "resp@coop.test",
    name: "Responsável",
    password: "x",
    role: "responsavel",
    cooperativaId: COOP,
    cooperadoId: "coop-member-1",
    active: true,
    ...overrides,
  };
}

function cooperadoUser(): User {
  return {
    id: "u-coop",
    email: "coop@coop.test",
    name: "Cooperado",
    password: "x",
    role: "cooperado",
    cooperativaId: COOP,
    cooperadoId: "coop-member-2",
    active: true,
  };
}

assert.equal(RESPONSAVEL_PAINEL_CONTRATO_VERSION, 1);

// CASO 1 — responsável válido (perfil duplo) abre painel staff
{
  const record = staffUser();
  const data = emptyData([record]);
  const session = { ...record, password: undefined } as Omit<User, "password">;
  assert.equal(resolveAppUserRole(session, data), "responsavel");
  assert.equal(canAccessPainelResponsavel(session, data), true);
  const gate = evaluateResponsavelPainelAbertura({
    accountUser: session,
    authSubject: session,
    data,
    dataReady: true,
  });
  assert.equal(gate.showAdminPainel, true);
}

// CASO 2 — cooperado não entra no painel responsável
{
  const record = cooperadoUser();
  const data = emptyData([record]);
  const session = { ...record, password: undefined } as Omit<User, "password">;
  assert.equal(canAccessPainelResponsavel(session, data), false);
  assert.equal(shouldRenderStaffPainelUi(session, data), false);
  const gate = evaluateResponsavelPainelAbertura({
    accountUser: session,
    authSubject: session,
    data,
    dataReady: true,
  });
  assert.equal(gate.showAdminPainel, false);
}

// CASO 3 — cold start: sessão staff sem AppData ainda abre gestão (não cooperado silencioso)
{
  const session = {
    id: "u-resp",
    email: "resp@coop.test",
    name: "Responsável",
    role: "responsavel",
    cooperativaId: COOP,
    cooperadoId: "coop-member-1",
    active: true,
  } as Omit<User, "password">;
  assert.equal(canAccessPainelResponsavelSession(session), true);
  const gate = evaluateResponsavelPainelAbertura({
    accountUser: session,
    authSubject: session,
    data: null,
    dataReady: false,
  });
  assert.equal(gate.showAdminPainel, true);
  assert.equal(shouldPrioritizeStaffColdShell(session, false), true);
  assert.equal(shouldPrioritizeStaffColdShell(session, true), false);
}

// CASO 4 — perfil duplo: experiência cooperado não deve ganhar do shell gestão antes do warm
{
  const record = staffUser();
  const data = emptyData([record]);
  const account = { ...record, password: undefined } as Omit<User, "password">;
  const experienceCooperado = {
    ...account,
    role: "cooperado" as const,
  };
  assert.equal(shouldPrioritizeStaffColdShell(account, false), true);
  assert.equal(
    shouldPrioritizeStaffColdShell(experienceCooperado, false),
    false,
    "user experiência cooperado não substitui accountUser staff no cold shell"
  );
  assert.equal(resolveAuthoritativePanelRole({ ...account, role: "cooperado" }, data), "responsavel");
}

// CASO 5 — menu cold gestão contém rotas âncora
{
  const session = staffUser();
  const menus = staffShellMenusBeforeDataWarm(session);
  assertStaffColdShellMenusValid(session, menus);
}

console.log(`test-responsavel-painel-regression: OK (contrato v${RESPONSAVEL_PAINEL_CONTRATO_VERSION})`);
