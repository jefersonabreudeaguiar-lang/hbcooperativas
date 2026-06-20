import type { Action, Resource, UserRole } from "@/types";

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
  presidente: {
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

export function can(role: UserRole, resource: Resource, action: Action): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action);
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "tesoureiro";
}

export function isDiretoriaRole(role: UserRole): boolean {
  return role === "presidente" || isAdminRole(role);
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

/** Menu do cooperado no drawer mobile (sem repetir a barra inferior). */
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

export function getMenuItems(role: UserRole): { href: string; label: string; resource: Resource }[] {
  if (role === "cooperado") {
    return COOPERADO_MENU.filter((item) => can(role, item.resource, "view") || item.href === "/meu-cadastro");
  }

  const source = role === "presidente"
    ? DIRETORIA_MENU.filter((i) =>
        ["/dashboard", "/notas-pedido", "/ficha-corrida", "/contratos", "/meu-perfil", "/cooperados", "/mensalidades", "/comunicados", "/relatorios", "/fechamento-mensal"].includes(i.href)
        && can(role, i.resource, "view")
      )
    : DIRETORIA_MENU;

  return source.filter((item) => can(role, item.resource, "view"));
}

/** Menu lateral mobile do cooperado — só cadastro e avisos (o restante fica na barra inferior). */
export function getCooperadoDrawerMenuItems(role: UserRole): { href: string; label: string; resource: Resource }[] {
  if (role !== "cooperado") return getMenuItems(role);
  return COOPERADO_DRAWER_MENU.filter(
    (item) => can(role, item.resource, "view") || item.href === "/meu-cadastro"
  );
}

/** @deprecated Use getMenuItems — kept for compatibility */
export function getCooperadoExtraItems(): { href: string; label: string }[] {
  return [];
}

export function getMobileNavItems(role: UserRole): { href: string; label: string; resource: Resource }[] {
  if (role === "cooperado") {
    return COOPERADO_MENU.filter((i) => ["/dashboard", "/notas-pedido", "/precos", "/ficha-corrida", "/mensalidades"].includes(i.href));
  }
  const presidenteItems: { href: string; label: string; resource: Resource }[] = [
    { href: "/dashboard", label: "Início", resource: "dashboard" },
    { href: "/notas-pedido", label: "Conferir", resource: "notas_pedido" },
    { href: "/ficha-corrida", label: "Pagar", resource: "ficha_corrida" },
    { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
    { href: "/contratos", label: "Contratos", resource: "instituicoes" },
    { href: "/meu-perfil", label: "Perfil", resource: "cooperativas" },
  ];
  if (role === "presidente") {
    return presidenteItems.filter((i) => can(role, i.resource, "view"));
  }
  const adminItems: { href: string; label: string; resource: Resource }[] = [
    { href: "/dashboard", label: "Início", resource: "dashboard" },
    { href: "/notas-pedido", label: "Conferir", resource: "notas_pedido" },
    { href: "/ficha-corrida", label: "Pagar", resource: "ficha_corrida" },
    { href: "/contratos", label: "Contratos", resource: "instituicoes" },
    { href: "/cooperados", label: "Cooperados", resource: "cooperados" },
  ];
  return adminItems.filter((i) => can(role, i.resource, "view"));
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  tesoureiro: "Tesoureiro",
  presidente: "Presidente / Responsável",
  cooperado: "Cooperado",
};
