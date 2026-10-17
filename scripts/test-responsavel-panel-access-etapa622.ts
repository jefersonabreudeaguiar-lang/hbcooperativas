/**
 * BIC Etapa 6.2.2 — painel responsável: abertura, guard e perfil duplo.
 * Uso: npx tsx scripts/test-responsavel-panel-access-etapa622.ts
 */
import assert from "node:assert/strict";
import type { AppData, User } from "../src/types/index.ts";
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

function evaluateDashboardStaffOpen(
  accountUser: Omit<User, "password"> | null,
  data: AppData | null,
  dataReady: boolean
): { canGestao: boolean; staffPainelUi: boolean; open: boolean } {
  const authSubject = accountUser;
  const staffPainelUi = Boolean(accountUser && shouldRenderStaffPainelUi(accountUser, data));
  const canGestao = dataReady
    ? Boolean(authSubject && canAccessPainelResponsavel(authSubject, data))
    : Boolean(authSubject && canAccessPainelResponsavelSession(authSubject));
  return { canGestao, staffPainelUi, open: canGestao && staffPainelUi };
}

// CASO 1 — responsável válido (perfil duplo) abre painel staff no desktop
{
  const record = staffUser();
  const data = emptyData([record]);
  const session = { ...record, password: undefined } as Omit<User, "password">;
  const effectiveRole = resolveAppUserRole(session, data);
  assert.equal(effectiveRole, "responsavel", "sessão não deve perder papel staff");
  assert.equal(canAccessPainelResponsavel(session, data), true);
  const gate = evaluateDashboardStaffOpen(session, data, true);
  assert.equal(gate.open, true, "dashboard staff deve abrir");
}

// CASO 2 — cooperado não entra no painel responsável
{
  const record = cooperadoUser();
  const data = emptyData([record]);
  const session = { ...record, password: undefined } as Omit<User, "password">;
  assert.equal(canAccessPainelResponsavel(session, data), false);
  assert.equal(shouldRenderStaffPainelUi(session, data), false);
  const gate = evaluateDashboardStaffOpen(session, data, true);
  assert.equal(gate.open, false);
}

// CASO 3 — sessão incompleta (sem AppData): JWT/session staff ainda autoriza, não fica “cooperado silencioso”
{
  const session = {
    id: "u-resp",
    email: "resp@coop.test",
    name: "Responsável",
    role: "responsavel",
    cooperativaId: COOP,
    active: true,
  } as Omit<User, "password">;
  assert.equal(canAccessPainelResponsavelSession(session), true);
  const gateWarm = evaluateDashboardStaffOpen(session, null, false);
  assert.equal(gateWarm.canGestao, true);
  assert.equal(gateWarm.staffPainelUi, true);
  assert.equal(gateWarm.open, true);
}

// CASO 4 — sessão persistida com role cooperado stale; users[] local restaura staff
{
  const record = staffUser();
  const data = emptyData([record]);
  const staleSession = {
    ...record,
    role: "cooperado" as const,
    password: undefined,
  } as Omit<User, "password">;
  assert.equal(resolveAuthoritativePanelRole(staleSession, data), "responsavel");
  assert.equal(canAccessPainelResponsavel(staleSession, data), true);
  const fixedRole = resolveAppUserRole({ ...staleSession, role: "responsavel" }, data);
  assert.equal(fixedRole, "responsavel");
}

console.log("test-responsavel-panel-access-etapa622: OK");
