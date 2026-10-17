/**
 * BIC Etapa 6.2.2 — painel responsável: abertura, guard e perfil duplo.
 * Uso: npx tsx scripts/test-responsavel-panel-access-etapa622.ts
 */
import assert from "node:assert/strict";
import type { AppData, User } from "../src/types/index.ts";
import { isCooperadoAppUser, resolveAppUserRole } from "../src/permissions/index.ts";
import {
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
  resolveAuthoritativePanelRole,
} from "../src/lib/security/responsavelPanelAccess.ts";
import { shouldRenderStaffPainelUi } from "../src/lib/staffNavigationUser.ts";
import {
  listarMesesEmAbertoPagamentoResponsavel,
  listarMesesPendentesPagamentoResponsavel,
} from "../src/services/cooperadoEntregasService.ts";
import type { PagamentoCooperadoRegistro } from "../src/types/index.ts";

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
    arquivosMensais: [],
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
  assert.equal(
    isCooperadoAppUser({ role: effectiveRole, cooperadoId: session.cooperadoId }),
    false,
    "perfil duplo staff não é cooperado app"
  );
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
  const fixedRole = resolveAppUserRole(staleSession, data);
  assert.equal(fixedRole, "responsavel");
  assert.equal(canAccessPainelResponsavelSession(staleSession, data), true);
}

// CASO 5 — mês com pagamento confirmado não entra em «em aberto» do responsável
{
  const record = staffUser();
  const mes = "2026-09";
  const data = emptyData([record]);
  data.cooperados = [
    {
      id: "coop-member-1",
      nomeCompleto: "Cooperado Teste",
      cooperativaId: COOP,
      status: "ativo",
      chavePix: "pix@test",
    } as AppData["cooperados"][0],
  ];
  data.fichaCorrida = [
    {
      id: "f1",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mes,
      notaPedidoId: "n1",
      status: "pago",
      valorBruto: 100,
      valorLiquido: 90,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    },
  ];
  data.notasPedido = [
    {
      id: "n1",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "pago",
      valorLiquido: 90,
      itens: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      dataEntrega: "2026-09-01",
    } as AppData["notasPedido"][0],
  ];
  const pagamento: PagamentoCooperadoRegistro = {
    id: "pg-1",
    cooperadoId: "coop-member-1",
    cooperativaId: COOP,
    mesReferencia: mes,
    status: "confirmado",
    valorLiquido: 90,
    valorBruto: 100,
    pagoEm: "2026-09-20T00:00:00.000Z",
    createdAt: "2026-09-20T00:00:00.000Z",
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
  };
  data.pagamentosCooperado = [pagamento];
  const abertos = listarMesesEmAbertoPagamentoResponsavel(data, "coop-member-1", COOP);
  assert.equal(abertos.includes(mes), false, "mês pago não deve ficar em aberto");
}

// CASO 6 — débito no livro caixa remove mês do «Em aberto» (Conferir entregas)
{
  const mes = "2026-08";
  const data = emptyData([]);
  data.cooperados = [
    {
      id: "coop-member-1",
      nomeCompleto: "Cooperado Teste",
      cooperativaId: COOP,
      status: "ativo",
      chavePix: "pix@test",
    } as AppData["cooperados"][0],
  ];
  data.fichaCorrida = [
    {
      id: "f1",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mes,
      notaPedidoId: "n1",
      status: "pago",
      valorBruto: 200,
      valorLiquido: 180,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    },
  ];
  data.notasPedido = [
    {
      id: "n1",
      cooperadoId: "coop-member-1",
      cooperativaId: COOP,
      mesReferencia: mes,
      status: "pago",
      valorLiquido: 180,
      itens: [],
      createdAt: "2026-08-01T00:00:00.000Z",
      dataEntrega: "2026-08-01",
    } as AppData["notasPedido"][0],
  ];
  const pagamento: PagamentoCooperadoRegistro = {
    id: "pg-caixa-1",
    cooperadoId: "coop-member-1",
    cooperativaId: COOP,
    mesReferencia: mes,
    status: "confirmado",
    valorLiquido: 180,
    valorBruto: 200,
    pagoEm: "2026-08-22T00:00:00.000Z",
    createdAt: "2026-08-22T00:00:00.000Z",
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
  };
  data.pagamentosCooperado = [pagamento];
  data.livroCaixa = [
    {
      id: "lc-1",
      cooperativaId: COOP,
      data: "2026-08-22",
      mesReferencia: mes,
      tipo: "debito",
      valor: 180,
      historico: "Pagamento merenda",
      origem: "pagamento_cooperado",
      origemId: "pg_caixa_pg-caixa-1",
    },
  ];
  const abertos = listarMesesEmAbertoPagamentoResponsavel(data, "coop-member-1", COOP);
  assert.equal(abertos.includes(mes), false, "mês debitado no caixa não deve ficar em aberto");
}

console.log("test-responsavel-panel-access-etapa622: OK");
