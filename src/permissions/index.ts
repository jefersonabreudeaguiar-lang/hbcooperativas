import type { Action, ModoAcesso, Resource, User, UserRole } from "@/types";

type PermissionMatrix = Record<UserRole, Partial<Record<Resource, Action[]>>>;

const ALL_CRUD: Action[] = ["view", "create", "edit", "delete", "export"];
const VIEW_EXPORT: Action[] = ["view", "export"];
const VIEW_ONLY: Action[] = ["view"];

export const PERMISSIONS: PermissionMatrix = {
  admin: {
    dashboard: ALL_CRUD,
    cooperativas: ALL_CRUD,
    cooperados: ALL_CRUD,
    mensalidades: ALL_CRUD,
    cotas: ALL_CRUD,
    entregas: ALL_CRUD,
    pagamentos: ALL_CRUD,
    descontos: ALL_CRUD,
    financeiro: ALL_CRUD,
    comunicados: ALL_CRUD,
    reclamacoes: ALL_CRUD,
    votacoes: ALL_CRUD,
    propriedades: ALL_CRUD,
    veiculos: ALL_CRUD,
    instituicoes: ALL_CRUD,
    notas_pedido: ALL_CRUD,
    ficha_corrida: ALL_CRUD,
    relatorios: VIEW_EXPORT,
    fechamento: ["view", "create", "edit", "approve", "export"],
    livro_caixa: ALL_CRUD,
    prestacao_contas: ALL_CRUD,
    conta_coop: ALL_CRUD,
    contador: VIEW_EXPORT,
  },
  tesoureiro: {
    dashboard: ALL_CRUD,
    cooperativas: VIEW_ONLY,
    cooperados: ALL_CRUD,
    mensalidades: ALL_CRUD,
    cotas: ALL_CRUD,
    entregas: ALL_CRUD,
    pagamentos: ALL_CRUD,
    descontos: ALL_CRUD,
    financeiro: ALL_CRUD,
    comunicados: ALL_CRUD,
    reclamacoes: ALL_CRUD,
    votacoes: ALL_CRUD,
    propriedades: ALL_CRUD,
    veiculos: ALL_CRUD,
    instituicoes: ALL_CRUD,
    notas_pedido: ALL_CRUD,
    ficha_corrida: ALL_CRUD,
    relatorios: VIEW_EXPORT,
    fechamento: ["view", "create", "edit", "export"],
    livro_caixa: ALL_CRUD,
    prestacao_contas: ALL_CRUD,
    conta_coop: ALL_CRUD,
    contador: VIEW_EXPORT,
  },
  responsavel: {
    dashboard: VIEW_ONLY,
    cooperativas: ["view", "create", "edit", "export"],
    cooperados: ["view", "edit", "export"],
    mensalidades: ["view", "edit", "export"],
    cotas: VIEW_ONLY,
    instituicoes: ALL_CRUD,
    notas_pedido: ["view", "create", "edit", "approve", "export"],
    ficha_corrida: ["view", "edit", "export"],
    comunicados: ["view", "create", "edit", "export"],
    reclamacoes: ["view", "create", "edit", "delete", "export"],
    votacoes: ["view", "create", "edit", "export"],
    relatorios: VIEW_EXPORT,
    fechamento: ["view", "approve", "export"],
    livro_caixa: ["view", "create", "edit", "export"],
    prestacao_contas: ["view", "create", "edit", "delete", "export"],
    conta_coop: ["view", "create", "edit", "approve", "export"],
  },
  cooperado: {
    dashboard: VIEW_ONLY,
    instituicoes: VIEW_ONLY,
    mensalidades: VIEW_ONLY,
    notas_pedido: ["view", "create", "edit"],
    ficha_corrida: VIEW_ONLY,
    descontos: VIEW_ONLY,
    comunicados: VIEW_ONLY,
    prestacao_contas: ["view", "create", "edit"],
    conta_coop: ["view", "create"],
  },
  parceiro: {
    dashboard: VIEW_ONLY,
    conta_coop: ["view", "create"],
  },
  contador: {
    dashboard: VIEW_ONLY,
    contador: VIEW_EXPORT,
    relatorios: VIEW_EXPORT,
    fechamento: VIEW_EXPORT,
    ficha_corrida: VIEW_EXPORT,
    notas_pedido: VIEW_EXPORT,
    mensalidades: VIEW_EXPORT,
    cotas: VIEW_EXPORT,
    livro_caixa: VIEW_EXPORT,
    prestacao_contas: VIEW_EXPORT,
    financeiro: VIEW_EXPORT,
    descontos: VIEW_EXPORT,
    instituicoes: VIEW_EXPORT,
    cooperados: VIEW_ONLY,
    cooperativas: VIEW_ONLY,
    conta_coop: VIEW_EXPORT,
    comunicados: VIEW_ONLY,
    reclamacoes: VIEW_ONLY,
    votacoes: VIEW_ONLY,
  },
};

export type PermissionSubject = Pick<
  User,
  "role" | "modoAcesso" | "permissoesExtras" | "permissoesNegadas" | "responsavelPrincipal"
>;

export interface ModuloAcesso {
  resource: Resource;
  label: string;
  href?: string;
  actions: Action[];
}

/** Módulos que o responsável principal pode liberar ou restringir. */
export const MODULOS_ACESSO: ModuloAcesso[] = [
  { resource: "dashboard", label: "Início", href: "/dashboard", actions: VIEW_ONLY },
  { resource: "notas_pedido", label: "Conferir entregas", href: "/notas-pedido", actions: ["view", "create", "edit", "approve", "export"] },
  { resource: "ficha_corrida", label: "Pagar cooperados", href: "/ficha-corrida", actions: ["view", "edit", "export"] },
  { resource: "instituicoes", label: "Contratos", href: "/contratos", actions: ALL_CRUD },
  { resource: "cooperados", label: "Cooperados", href: "/cooperados", actions: ["view", "create", "edit", "delete", "export"] },
  { resource: "mensalidades", label: "Mensalidades", href: "/mensalidades", actions: ["view", "edit", "export"] },
  { resource: "comunicados", label: "Comunicados", href: "/comunicados", actions: VIEW_ONLY },
  { resource: "votacoes", label: "Votações", href: "/votacoes", actions: ALL_CRUD },
  { resource: "reclamacoes", label: "Reclamações", href: "/reclamacoes", actions: ALL_CRUD },
  { resource: "relatorios", label: "Relatórios", href: "/relatorios", actions: VIEW_EXPORT },
  { resource: "fechamento", label: "Fechamento mensal", href: "/fechamento-mensal", actions: ["view", "approve", "export"] },
  { resource: "cooperativas", label: "Perfil da cooperativa", href: "/meu-perfil", actions: ["view", "create", "edit", "export"] },
  { resource: "conta_coop", label: "Conta Coop", href: "/conta-coop", actions: ["view", "create", "edit", "approve", "export"] },
];

export const PRESET_RELATORIOS: Resource[] = ["dashboard", "relatorios", "fechamento"];

/** Módulos liberados automaticamente ao cadastrar um contador (somente leitura contábil). */
export const PRESET_CONTADOR: Resource[] = [
  "dashboard",
  "contador",
  "relatorios",
  "fechamento",
  "ficha_corrida",
  "notas_pedido",
  "mensalidades",
  "livro_caixa",
  "prestacao_contas",
  "financeiro",
  "instituicoes",
  "cooperados",
  "conta_coop",
];

export const CONTADOR_ACESSO_DESCRICAO =
  "Painel contador, conciliação, trilha de auditoria, relatórios R1–R9, fechamento e consultas financeiras — sem alterar lançamentos.";

export function can(role: UserRole, resource: Resource, action: Action): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action);
}

export function canUser(user: PermissionSubject, resource: Resource, action: Action): boolean {
  if (user.modoAcesso === "parcial") {
    const extras = user.permissoesExtras?.[resource];
    return extras?.includes(action) ?? false;
  }

  if (!can(user.role, resource, action)) return false;
  const denied = user.permissoesNegadas?.[resource];
  if (denied?.includes(action)) return false;
  return true;
}

export function resourcesFromModulos(modulos: Resource[]): Partial<Record<Resource, Action[]>> {
  const map: Partial<Record<Resource, Action[]>> = {};
  for (const mod of MODULOS_ACESSO) {
    if (modulos.includes(mod.resource)) map[mod.resource] = [...mod.actions];
  }
  return map;
}

export function negarModulos(role: UserRole, modulosNegados: Resource[]): Partial<Record<Resource, Action[]>> {
  const map: Partial<Record<Resource, Action[]>> = {};
  for (const mod of MODULOS_ACESSO) {
    if (!modulosNegados.includes(mod.resource)) continue;
    const allowed = PERMISSIONS[role]?.[mod.resource] ?? mod.actions;
    map[mod.resource] = [...allowed];
  }
  return map;
}

export function modulosLiberados(user: PermissionSubject): Resource[] {
  if (user.modoAcesso === "parcial") {
    return Object.keys(user.permissoesExtras ?? {}) as Resource[];
  }
  return MODULOS_ACESSO.filter((mod) => {
    const denied = user.permissoesNegadas?.[mod.resource];
    const allowed = PERMISSIONS[user.role]?.[mod.resource] ?? mod.actions;
    if (!allowed.length) return false;
    return !denied || denied.length < allowed.length;
  }).map((m) => m.resource);
}

export function modulosRestritos(user: PermissionSubject): Resource[] {
  if (user.modoAcesso !== "total") return [];
  return MODULOS_ACESSO.filter((mod) => {
    const denied = user.permissoesNegadas?.[mod.resource];
    const allowed = PERMISSIONS[user.role]?.[mod.resource] ?? [];
    return denied && denied.length >= allowed.length && allowed.length > 0;
  }).map((m) => m.resource);
}

export function canGerenciarEquipe(user: Pick<User, "role" | "responsavelPrincipal">): boolean {
  if (user.role === "admin" || user.role === "tesoureiro") return true;
  return user.role === "responsavel" && user.responsavelPrincipal === true;
}

export function getUserFuncaoLabel(user: Pick<User, "role" | "funcao">): string {
  return user.funcao?.trim() || ROLE_LABELS[user.role];
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "tesoureiro";
}

export function isResponsavelRole(role: UserRole): boolean {
  return role === "responsavel";
}

export function isDiretoriaRole(role: UserRole): boolean {
  return isResponsavelRole(role) || isAdminRole(role);
}

export function isContadorRole(role: UserRole): boolean {
  return role === "contador";
}

/** Acesso à Central do Contador (auditoria). */
export function canAccessCentralContador(role: UserRole): boolean {
  return role === "contador" || role === "admin" || role === "tesoureiro";
}

export function isReadOnlyAuditorRole(role: UserRole): boolean {
  return role === "contador";
}

const COOPERADO_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/dashboard", label: "Início", resource: "dashboard" },
  { href: "/notas-pedido", label: "Minhas entregas", resource: "notas_pedido" },
  { href: "/precos", label: "Preços", resource: "instituicoes" },
  { href: "/ficha-corrida", label: "Quanto vou receber", resource: "ficha_corrida" },
  { href: "/mensalidades", label: "Mensalidades", resource: "mensalidades" },
  { href: "/meu-cadastro", label: "Meu cadastro", resource: "dashboard" },
  { href: "/prestacao-contas", label: "Prestação de contas", resource: "prestacao_contas" },
];

/** Menu hamburger mobile do cooperado — sem repetir a barra inferior. */
const COOPERADO_DRAWER_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/dashboard", label: "Início", resource: "dashboard" },
  { href: "/meu-cadastro", label: "Meu cadastro", resource: "dashboard" },
  { href: "/comunicados", label: "Avisos", resource: "comunicados" },
  { href: "/prestacao-contas", label: "Prestação de contas", resource: "prestacao_contas" },
];

const PARCEIRO_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/mercado-parceiro", label: "Painel mercado", resource: "conta_coop" },
];

const CONTADOR_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/contador/dashboard", label: "Painel contador", resource: "contador" },
  { href: "/contador/conciliacao", label: "Conciliação", resource: "contador" },
  { href: "/contador/trilha-auditoria", label: "Trilha de auditoria", resource: "contador" },
  { href: "/contador/parecer", label: "Parecer contábil", resource: "contador" },
  { href: "/relatorios", label: "Relatórios", resource: "relatorios" },
  { href: "/fechamento-mensal", label: "Fechamento mensal", resource: "fechamento" },
  { href: "/ficha-corrida", label: "Ficha corrida", resource: "ficha_corrida" },
  { href: "/livro-caixa", label: "Livro caixa", resource: "livro_caixa" },
  { href: "/conta-coop", label: "Conta Coop", resource: "conta_coop" },
];

const CREDIT_MENU_BY_ROLE: Partial<Record<UserRole, { href: string; label: string; resource: Resource }>> = {
  cooperado: { href: "/minha-conta-coop", label: "Conta Coop", resource: "conta_coop" },
  responsavel: { href: "/conta-coop", label: "Conta Coop", resource: "conta_coop" },
  admin: { href: "/conta-coop", label: "Conta Coop", resource: "conta_coop" },
  tesoureiro: { href: "/conta-coop", label: "Conta Coop", resource: "conta_coop" },
};

const DIRETORIA_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/dashboard", label: "Início", resource: "dashboard" },
  { href: "/notas-pedido", label: "Conferir entregas", resource: "notas_pedido" },
  { href: "/ficha-corrida", label: "Pagar cooperados", resource: "ficha_corrida" },
  { href: "/contratos", label: "Contratos", resource: "instituicoes" },
  { href: "/meu-perfil", label: "Perfil da cooperativa", resource: "cooperativas" },
  { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
  { href: "/mensalidades", label: "Mensalidades", resource: "mensalidades" },
  { href: "/votacoes", label: "Votações", resource: "votacoes" },
  { href: "/cotas", label: "Cotas", resource: "cotas" },
  { href: "/livro-caixa", label: "Livro caixa", resource: "livro_caixa" },
  { href: "/prestacao-contas", label: "Prestação de contas", resource: "prestacao_contas" },
  // Entregas/Pagamentos legado removidos do menu — fluxo oficial: notas-pedido + ficha-corrida
  { href: "/descontos", label: "Descontos", resource: "descontos" },
  { href: "/financeiro", label: "Financeiro", resource: "financeiro" },
  { href: "/comunicados", label: "Comunicados", resource: "comunicados" },
  { href: "/reclamacoes", label: "Reclamações", resource: "reclamacoes" },
  { href: "/propriedades", label: "Propriedades", resource: "propriedades" },
  { href: "/veiculos", label: "Veículos", resource: "veiculos" },
  { href: "/relatorios", label: "Relatórios", resource: "relatorios" },
  { href: "/fechamento-mensal", label: "Fechamento mensal", resource: "fechamento" },
  { href: "/contador/dashboard", label: "Central do contador", resource: "contador" },
];

const RESPONSAVEL_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/contratos",
  "/meu-perfil",
  "/cooperados",
  "/mensalidades",
  "/livro-caixa",
  "/prestacao-contas",
  "/comunicados",
  "/votacoes",
  "/reclamacoes",
  "/relatorios",
  "/fechamento-mensal",
  "/conta-coop",
];

function filterMenuForUser(
  items: { href: string; label: string; resource: Resource }[],
  user: PermissionSubject
) {
  return items.filter((item) => canUser(user, item.resource, "view") || item.href === "/meu-cadastro");
}

/** Menu Conta Coop: módulo confirmado pelo servidor + perfil autorizado. */
export function isHbCreditNavVisible(creditEnabled: boolean, canViewContaCoop: boolean): boolean {
  return creditEnabled && canViewContaCoop;
}

export function appendHbCreditMenuItem(
  items: { href: string; label: string; resource: Resource }[],
  user: PermissionSubject,
  creditEnabled: boolean
): { href: string; label: string; resource: Resource }[] {
  const extra = CREDIT_MENU_BY_ROLE[user.role];
  if (
    !isHbCreditNavVisible(
      creditEnabled,
      Boolean(extra && canUser(user, extra.resource, "view"))
    )
  ) {
    return items;
  }
  if (items.some((i) => i.href === extra!.href)) return items;
  return [...items, extra!];
}

export function getMenuItems(
  user: PermissionSubject,
  creditEnabled = false
): { href: string; label: string; resource: Resource }[] {
  if (user.role === "parceiro") {
    return filterMenuForUser(PARCEIRO_MENU, user);
  }

  if (user.role === "contador") {
    return appendHbCreditMenuItem(filterMenuForUser(CONTADOR_MENU, user), user, creditEnabled);
  }

  if (user.role === "cooperado") {
    return appendHbCreditMenuItem(filterMenuForUser(COOPERADO_MENU, user), user, creditEnabled);
  }

  let source = DIRETORIA_MENU;
  if (user.role === "responsavel") {
    source = DIRETORIA_MENU.filter((i) => RESPONSAVEL_HREFS.includes(i.href));
  }

  return appendHbCreditMenuItem(filterMenuForUser(source, user), user, creditEnabled);
}

export function getCooperadoDrawerMenuItems(
  user: PermissionSubject,
  creditEnabled = false
): { href: string; label: string; resource: Resource }[] {
  if (user.role !== "cooperado") return getMenuItems(user, creditEnabled);
  return appendHbCreditMenuItem(filterMenuForUser(COOPERADO_DRAWER_MENU, user), user, creditEnabled);
}

export function getCooperadoExtraItems(): { href: string; label: string }[] {
  return [];
}

const COOPERADO_MOBILE_NAV_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/precos",
  "/ficha-corrida",
  "/mensalidades",
];

export function getMobileNavItems(
  user: PermissionSubject,
  creditEnabled = false
): { href: string; label: string; resource: Resource }[] {
  if (user.role === "cooperado") {
    const baseItems = COOPERADO_MENU.filter((i) =>
      COOPERADO_MOBILE_NAV_HREFS.includes(i.href)
    );
    return appendHbCreditMenuItem(filterMenuForUser(baseItems, user), user, creditEnabled);
  }

  if (user.role === "responsavel") {
    const responsavelItems: { href: string; label: string; resource: Resource }[] = [
      { href: "/dashboard", label: "Início", resource: "dashboard" },
      { href: "/notas-pedido", label: "Conferir", resource: "notas_pedido" },
      { href: "/ficha-corrida", label: "Pagar", resource: "ficha_corrida" },
      { href: "/conta-coop", label: "Conta Coop", resource: "conta_coop" },
      { href: "/votacoes", label: "Votações", resource: "votacoes" },
      { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
      { href: "/contratos", label: "Contratos", resource: "instituicoes" },
      { href: "/meu-perfil", label: "Perfil", resource: "cooperativas" },
      { href: "/relatorios", label: "Relatórios", resource: "relatorios" },
    ];
    return creditEnabled
      ? filterMenuForUser(responsavelItems, user)
      : filterMenuForUser(
          responsavelItems.filter((i) => i.href !== "/conta-coop"),
          user
        );
  }

  if (user.role === "tesoureiro" || user.role === "admin") {
    const tesoureiroItems: { href: string; label: string; resource: Resource }[] = [
      { href: "/dashboard", label: "Início", resource: "dashboard" },
      { href: "/contador/dashboard", label: "Contador", resource: "contador" },
      { href: "/notas-pedido", label: "Conferir", resource: "notas_pedido" },
      { href: "/ficha-corrida", label: "Pagar", resource: "ficha_corrida" },
      { href: "/votacoes", label: "Votações", resource: "votacoes" },
      { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
      { href: "/contratos", label: "Contratos", resource: "instituicoes" },
    ];
    return appendHbCreditMenuItem(filterMenuForUser(tesoureiroItems, user), user, creditEnabled);
  }

  if (user.role === "contador") {
    return filterMenuForUser(
      [
        { href: "/contador/dashboard", label: "Painel", resource: "contador" },
        { href: "/contador/conciliacao", label: "Conciliar", resource: "contador" },
        { href: "/contador/trilha-auditoria", label: "Auditoria", resource: "contador" },
        { href: "/contador/parecer", label: "Parecer", resource: "contador" },
        { href: "/relatorios", label: "Relatórios", resource: "relatorios" },
      ],
      user
    );
  }

  return [];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  responsavel: "Responsável",
  cooperado: "Cooperado",
  parceiro: "Mercado parceiro",
  contador: "Contador",
};

export const MODO_ACESSO_LABELS: Record<ModoAcesso, string> = {
  total: "Acesso total (função padrão)",
  parcial: "Acesso parcial (só o que liberar)",
};
