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
    propriedades: ALL_CRUD,
    veiculos: ALL_CRUD,
    instituicoes: ALL_CRUD,
    notas_pedido: ALL_CRUD,
    ficha_corrida: ALL_CRUD,
    relatorios: VIEW_EXPORT,
    fechamento: ["view", "create", "edit", "approve", "export"],
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
    propriedades: ALL_CRUD,
    veiculos: ALL_CRUD,
    instituicoes: ALL_CRUD,
    notas_pedido: ALL_CRUD,
    ficha_corrida: ALL_CRUD,
    relatorios: VIEW_EXPORT,
    fechamento: ["view", "create", "edit", "export"],
  },
  responsavel: {
    dashboard: VIEW_ONLY,
    cooperativas: ["view", "create", "edit", "export"],
    cooperados: VIEW_ONLY,
    mensalidades: ["view", "edit", "export"],
    cotas: VIEW_ONLY,
    instituicoes: ALL_CRUD,
    notas_pedido: ["view", "create", "edit", "approve", "export"],
    ficha_corrida: ["view", "edit", "export"],
    comunicados: VIEW_ONLY,
    relatorios: VIEW_EXPORT,
    fechamento: ["view", "approve", "export"],
  },
  cooperado: {
    dashboard: VIEW_ONLY,
    instituicoes: VIEW_ONLY,
    mensalidades: VIEW_ONLY,
    notas_pedido: ["view", "create", "edit"],
    ficha_corrida: VIEW_ONLY,
    descontos: VIEW_ONLY,
    comunicados: VIEW_ONLY,
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
  { resource: "relatorios", label: "Relatórios", href: "/relatorios", actions: VIEW_EXPORT },
  { resource: "fechamento", label: "Fechamento mensal", href: "/fechamento-mensal", actions: ["view", "approve", "export"] },
  { resource: "cooperativas", label: "Perfil da cooperativa", href: "/meu-perfil", actions: ["view", "create", "edit", "export"] },
];

export const PRESET_RELATORIOS: Resource[] = ["dashboard", "relatorios", "fechamento"];

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

const COOPERADO_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/dashboard", label: "Início", resource: "dashboard" },
  { href: "/notas-pedido", label: "Minhas entregas", resource: "notas_pedido" },
  { href: "/precos", label: "Preços", resource: "instituicoes" },
  { href: "/ficha-corrida", label: "Quanto vou receber", resource: "ficha_corrida" },
  { href: "/mensalidades", label: "Mensalidades", resource: "mensalidades" },
  { href: "/meu-cadastro", label: "Meu cadastro", resource: "dashboard" },
  { href: "/comunicados", label: "Avisos", resource: "comunicados" },
];

const COOPERADO_DRAWER_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/dashboard", label: "Início", resource: "dashboard" },
  { href: "/meu-cadastro", label: "Meu cadastro", resource: "dashboard" },
  { href: "/comunicados", label: "Avisos", resource: "comunicados" },
];

const DIRETORIA_MENU: { href: string; label: string; resource: Resource }[] = [
  { href: "/dashboard", label: "Início", resource: "dashboard" },
  { href: "/notas-pedido", label: "Conferir entregas", resource: "notas_pedido" },
  { href: "/ficha-corrida", label: "Pagar cooperados", resource: "ficha_corrida" },
  { href: "/contratos", label: "Contratos", resource: "instituicoes" },
  { href: "/meu-perfil", label: "Perfil da cooperativa", resource: "cooperativas" },
  { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
  { href: "/mensalidades", label: "Mensalidades", resource: "mensalidades" },
  { href: "/cotas", label: "Cotas", resource: "cotas" },
  { href: "/entregas", label: "Entregas (legado)", resource: "entregas" },
  { href: "/pagamentos", label: "Pagamentos (legado)", resource: "pagamentos" },
  { href: "/descontos", label: "Descontos", resource: "descontos" },
  { href: "/financeiro", label: "Financeiro", resource: "financeiro" },
  { href: "/comunicados", label: "Comunicados", resource: "comunicados" },
  { href: "/propriedades", label: "Propriedades", resource: "propriedades" },
  { href: "/veiculos", label: "Veículos", resource: "veiculos" },
  { href: "/relatorios", label: "Relatórios", resource: "relatorios" },
  { href: "/fechamento-mensal", label: "Fechamento mensal", resource: "fechamento" },
];

const RESPONSAVEL_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/contratos",
  "/meu-perfil",
  "/cooperados",
  "/mensalidades",
  "/comunicados",
  "/relatorios",
  "/fechamento-mensal",
];

function filterMenuForUser(
  items: { href: string; label: string; resource: Resource }[],
  user: PermissionSubject
) {
  return items.filter((item) => canUser(user, item.resource, "view") || item.href === "/meu-cadastro");
}

export function getMenuItems(user: PermissionSubject): { href: string; label: string; resource: Resource }[] {
  if (user.role === "cooperado") {
    return filterMenuForUser(COOPERADO_MENU, user);
  }

  let source = DIRETORIA_MENU;
  if (user.role === "responsavel") {
    source = DIRETORIA_MENU.filter((i) => RESPONSAVEL_HREFS.includes(i.href));
  }

  return filterMenuForUser(source, user);
}

export function getCooperadoDrawerMenuItems(user: PermissionSubject): { href: string; label: string; resource: Resource }[] {
  if (user.role !== "cooperado") return getMenuItems(user);
  return filterMenuForUser(COOPERADO_DRAWER_MENU, user);
}

export function getCooperadoExtraItems(): { href: string; label: string }[] {
  return [];
}

export function getMobileNavItems(user: PermissionSubject): { href: string; label: string; resource: Resource }[] {
  if (user.role === "cooperado") {
    return COOPERADO_MENU.filter((i) =>
      ["/dashboard", "/notas-pedido", "/precos", "/ficha-corrida", "/mensalidades"].includes(i.href)
    );
  }

  const responsavelItems: { href: string; label: string; resource: Resource }[] = [
    { href: "/dashboard", label: "Início", resource: "dashboard" },
    { href: "/notas-pedido", label: "Conferir", resource: "notas_pedido" },
    { href: "/ficha-corrida", label: "Pagar", resource: "ficha_corrida" },
    { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
    { href: "/contratos", label: "Contratos", resource: "instituicoes" },
    { href: "/meu-perfil", label: "Perfil", resource: "cooperativas" },
    { href: "/relatorios", label: "Relatórios", resource: "relatorios" },
  ];

  if (user.role === "responsavel") {
    return filterMenuForUser(responsavelItems, user);
  }

  const adminItems: { href: string; label: string; resource: Resource }[] = [
    { href: "/dashboard", label: "Início", resource: "dashboard" },
    { href: "/notas-pedido", label: "Conferir", resource: "notas_pedido" },
    { href: "/ficha-corrida", label: "Pagar", resource: "ficha_corrida" },
    { href: "/contratos", label: "Contratos", resource: "instituicoes" },
    { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
  ];
  return filterMenuForUser(adminItems, user);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  responsavel: "Responsável",
  cooperado: "Cooperado",
};

export const MODO_ACESSO_LABELS: Record<ModoAcesso, string> = {
  total: "Acesso total (função padrão)",
  parcial: "Acesso parcial (só o que liberar)",
};
