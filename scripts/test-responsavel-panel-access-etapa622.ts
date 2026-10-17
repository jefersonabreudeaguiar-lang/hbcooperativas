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
import { evaluateResponsavelIdentidade } from "../src/lib/responsavel/responsavelIdentidade.ts";
import { evaluateResponsavelPainelAbertura } from "../src/lib/responsavel/responsavelPainelContrato.ts";
import { getTotalValoresAPagarGestaoCooperativa } from "../src/lib/responsavel/responsavelGestaoLeitura.ts";
import { resolveGestaoCooperativaId } from "../src/utils/cooperativa.ts";
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
  assert.equal(
    getTotalValoresAPagarGestaoCooperativa(data, COOP),
    0,
    "Início «A pagar» não soma mês já debitado no caixa"
  );
}

// CASO 7 — sessão cooperado sem AppData não vira responsável silenciosamente
{
  const session = {
    id: "u-coop",
    email: "coop@coop.test",
    name: "Cooperado",
    role: "cooperado" as const,
    cooperativaId: COOP,
    cooperadoId: "coop-member-2",
    active: true,
  } as Omit<User, "password">;
  assert.equal(resolveAppUserRole(session, null), "cooperado");
}

// CASO 8 — Etapa 0: os quatro casos de identidade
{
  const staffPuro = staffUser({ cooperadoId: undefined });
  const duplo = staffUser();
  const coop = cooperadoUser();
  const dataStaff = emptyData([staffPuro, duplo, coop]);

  const rPuro = evaluateResponsavelIdentidade({
    accountUser: staffPuro,
    data: dataStaff,
    dataReady: true,
    mobile: false,
  });
  assert.equal(rPuro.caso, "responsavel_puro");
  assert.equal(rPuro.staffPainelUi, true);

  const rCoop = evaluateResponsavelIdentidade({
    accountUser: coop,
    data: emptyData([coop]),
    dataReady: true,
    mobile: true,
  });
  assert.equal(rCoop.caso, "cooperado_puro");
  assert.equal(rCoop.staffPainelUi, false);

  const rDuploDesk = evaluateResponsavelIdentidade({
    accountUser: duplo,
    data: dataStaff,
    dataReady: true,
    mobile: false,
  });
  assert.equal(rDuploDesk.caso, "duplo_desktop");
  assert.equal(rDuploDesk.staffPainelUi, true);

  const rDuploMob = evaluateResponsavelIdentidade({
    accountUser: duplo,
    data: dataStaff,
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: false,
  });
  assert.equal(rDuploMob.caso, "duplo_mobile_cooperado");
  assert.equal(rDuploMob.staffPainelUi, false);

  const rDuploMobGestao = evaluateResponsavelIdentidade({
    accountUser: duplo,
    data: dataStaff,
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: true,
  });
  assert.equal(rDuploMobGestao.caso, "duplo_mobile_gestao");
  assert.equal(rDuploMobGestao.staffPainelUi, true);
}

// CASO 9 — JWT cooperado no celular não abre painel gestão
{
  const jwtCoop = {
    ...staffUser(),
    role: "cooperado" as const,
  };
  const abertura = evaluateResponsavelPainelAbertura({
    accountUser: jwtCoop,
    authSubject: { ...jwtCoop, role: "cooperado" },
    data: emptyData([staffUser()]),
    dataReady: true,
  });
  const idMobile = evaluateResponsavelIdentidade({
    accountUser: jwtCoop,
    data: emptyData([staffUser()]),
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: false,
  });
  assert.equal(idMobile.staffPainelUi, false);
  assert.equal(idMobile.modo, "cooperado");
  void abertura;
}

// CASO 10 — staff com JWT cooperado stale (sem vínculo) no celular abre gestão
{
  const stale = staffUser({ cooperadoId: undefined, role: "cooperado" });
  const data = emptyData([{ ...stale, role: "responsavel" }]);
  const id = evaluateResponsavelIdentidade({
    accountUser: stale,
    data,
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: false,
  });
  assert.equal(id.canGestao, true, "builtin/users[] staff deve ter canGestao");
  assert.equal(id.staffPainelUi, true, "JWT cooperado stale sem vínculo abre o painel");
  assert.equal(id.modo, "gestao");
  assert.equal(id.caso, "responsavel_puro");
}

// CASO 11 — e-mail builtin com JWT cooperado no celular abre gestão
{
  const builtin = staffUser({
    email: "jefersonabreudeaguiar@gmail.com",
    role: "cooperado",
    cooperadoId: undefined,
  });
  const id = evaluateResponsavelIdentidade({
    accountUser: builtin,
    data: null,
    dataReady: false,
    mobile: true,
    preferPainelResponsavel: false,
  });
  assert.equal(id.canGestao, true);
  assert.equal(id.staffPainelUi, true, "e-mail builtin no celular não pode cair em skeleton");
  assert.equal(id.showAdminPainel, true);
}

// CASO 12 — cooperado puro no celular continua fora da gestão
{
  const coop = cooperadoUser();
  const id = evaluateResponsavelIdentidade({
    accountUser: coop,
    data: emptyData([coop]),
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: false,
  });
  assert.equal(id.staffPainelUi, false);
  assert.equal(id.canGestao, false);
  assert.equal(id.modo, "cooperado");
}

// CASO 13 — SSR (sem window) de staff com JWT cooperado não some o painel
{
  const stale = staffUser({ cooperadoId: undefined, role: "cooperado" });
  const data = emptyData([{ ...stale, role: "responsavel" }]);
  const abertura = evaluateResponsavelPainelAbertura({
    accountUser: stale,
    authSubject: stale,
    data,
    dataReady: true,
  });
  assert.equal(abertura.staffPainelUi, true, "SSR staff não pode hidratar como cooperado");
  assert.equal(abertura.showAdminPainel, true);
  assert.equal(abertura.canGestao, true);
}

// CASO 14 — canGestao sem staffPainelUi (duplo mobile) não é o Início gestão, mas o fallback do dashboard usa modo
{
  const duplo = staffUser();
  const abertura = evaluateResponsavelPainelAbertura({
    accountUser: duplo,
    authSubject: duplo,
    data: emptyData([duplo]),
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: false,
  });
  assert.equal(abertura.canGestao, true);
  assert.equal(abertura.staffPainelUi, false);
  assert.equal(abertura.modo, "cooperado");
  const aberturaPediuPainel = evaluateResponsavelPainelAbertura({
    accountUser: duplo,
    authSubject: duplo,
    data: emptyData([duplo]),
    dataReady: true,
    mobile: true,
    preferPainelResponsavel: true,
  });
  assert.equal(aberturaPediuPainel.staffPainelUi, true);
  assert.equal(aberturaPediuPainel.modo, "gestao");
}

// CASO 15 — e-mail builtin com users[] cooperado ainda acessa o painel
{
  const builtin = staffUser({
    email: "jefersonabreudeaguiar@gmail.com",
    role: "cooperado",
    cooperadoId: undefined,
  });
  const data = emptyData([{ ...builtin, role: "cooperado" }]);
  assert.equal(canAccessPainelResponsavel(builtin, data), true);
  assert.equal(canAccessPainelResponsavelSession(builtin, data), true);
}

// CASO 16 — gestão resolve cooperativa pelo CNPJ quando a sessão não tem id
{
  const staff = staffUser({ cooperativaId: undefined, cooperadoId: undefined });
  const data = emptyData([staff]);
  data.cooperativas[0].cnpj = "12345678000199";
  const scoped = { ...staff, cooperativaCnpj: "12.345.678/0001-99", cooperativaId: undefined };
  assert.equal(resolveGestaoCooperativaId(scoped, data), COOP);
}

// CASO 17 — uma cooperativa ativa basta para o painel não ficar vazio
{
  const staff = staffUser({ cooperativaId: undefined, cooperadoId: undefined });
  const data = emptyData([staff]);
  assert.equal(resolveGestaoCooperativaId(staff, data), COOP);
}

console.log("test-responsavel-panel-access-etapa622: OK");
