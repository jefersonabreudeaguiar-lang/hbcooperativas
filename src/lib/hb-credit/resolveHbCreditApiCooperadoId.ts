import type { User } from "@/types";
import type { CreditAuthOk } from "@/lib/security/creditGuard";

/**
 * ID usado em /api/credit/account — deve bater com JWT (requireCreditCooperado)
 * e com a chave do cache local (persistência da conta HB).
 */
export function resolveHbCreditApiCooperadoId(
  user: Pick<User, "role" | "cooperadoId"> | null | undefined,
  canonicalCooperadoId?: string | null
): string {
  const sessionId = user?.cooperadoId?.trim() ?? "";
  const canon = canonicalCooperadoId?.trim() ?? "";
  if (user?.role === "cooperado" && sessionId) return sessionId;
  return canon || sessionId;
}

/** Cooperado autenticado: sempre o ID do JWT (ignora ID canônico errado do cliente). */
export function resolveCreditAccountCooperadoIdForRequest(
  ctx: CreditAuthOk,
  requestedCooperadoId: string
): string {
  const requested = requestedCooperadoId.trim();
  if (!ctx.enforced || !ctx.session) return requested;
  if (ctx.session.role === "cooperado") {
    const sid = ctx.session.cooperadoId?.trim();
    if (sid) return sid;
  }
  return requested;
}
