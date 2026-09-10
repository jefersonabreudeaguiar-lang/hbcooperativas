import type { NextResponse } from "next/server";
import { NextResponse as NR } from "next/server";
import type { Action, Resource, UserRole } from "@/types";
import { canUser, type PermissionSubject } from "@/permissions";
import type { SessionClaims } from "@/lib/security/jwt";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const API_RESOURCE_RULES: Array<{
  pattern: RegExp;
  resource: Resource;
  writeActions?: Action[];
  readActions?: Action[];
}> = [
  { pattern: /^\/api\/cooperados/, resource: "cooperados", writeActions: ["create", "edit", "delete"], readActions: ["view"] },
  { pattern: /^\/api\/notas-pedido/, resource: "notas_pedido", writeActions: ["create", "edit", "approve", "delete"], readActions: ["view"] },
  { pattern: /^\/api\/cooperativa-sync/, resource: "cooperados", writeActions: ["edit"], readActions: ["view"] },
  { pattern: /^\/api\/cooperativa-audit/, resource: "cooperados", writeActions: ["create"], readActions: ["view"] },
  { pattern: /^\/api\/cooperativas\/[^/]+/, resource: "cooperativas", writeActions: ["edit"], readActions: ["view"] },
  { pattern: /^\/api\/payments\/hb-charge/, resource: "conta_coop", writeActions: ["create", "edit", "approve"], readActions: ["view"] },
  { pattern: /^\/api\/votacao/, resource: "votacoes", writeActions: ["create", "edit"], readActions: ["view"] },
];

export function sessionToPermissionSubject(session: SessionClaims): PermissionSubject {
  return {
    role: session.role as UserRole,
    modoAcesso: session.modoAcesso ?? "total",
    permissoesExtras: session.permissoesExtras,
    permissoesNegadas: session.permissoesNegadas,
    responsavelPrincipal: session.responsavelPrincipal === true,
  };
}

export function inferApiPermission(
  pathname: string,
  method: string
): { resource: Resource; action: Action } | null {
  const m = method.toUpperCase();
  const isWrite = WRITE_METHODS.has(m);
  for (const rule of API_RESOURCE_RULES) {
    if (!rule.pattern.test(pathname)) continue;
    if (isWrite) {
      const action =
        m === "POST"
          ? (rule.writeActions?.includes("create") ? "create" : rule.writeActions?.[0])
          : rule.writeActions?.includes("edit")
            ? "edit"
            : rule.writeActions?.[0];
      if (action) return { resource: rule.resource, action };
    } else if (m === "GET") {
      return { resource: rule.resource, action: "view" };
    }
  }
  return null;
}

export function canSessionPerform(
  session: SessionClaims,
  resource: Resource,
  action: Action
): boolean {
  if (session.role === "admin") return true;
  if (session.role === "tesoureiro") return canUser({ role: "tesoureiro", modoAcesso: "total" }, resource, action);
  if (!isStaffRole(session.role as UserRole)) return true;
  return canUser(sessionToPermissionSubject(session), resource, action);
}

export function requireSessionApiPermission(
  session: SessionClaims | null,
  pathname: string,
  method: string,
  enforced: boolean
): NextResponse | null {
  if (!enforced || !session) return null;
  if (session.role === "cooperado" || session.role === "parceiro" || session.role === "contador") {
    return null;
  }

  const inferred = inferApiPermission(pathname, method);
  if (!inferred) return null;

  if (!canSessionPerform(session, inferred.resource, inferred.action)) {
    return NR.json(
      {
        error: "Sem permissão para esta ação neste módulo.",
        code: "MODULE_DENIED",
        resource: inferred.resource,
        action: inferred.action,
      },
      { status: 403 }
    );
  }

  return null;
}
