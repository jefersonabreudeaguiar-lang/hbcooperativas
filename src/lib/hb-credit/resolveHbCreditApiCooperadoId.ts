import type { AppData, User } from "@/types";
import type { CreditAuthOk } from "@/lib/security/creditGuard";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";

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

/** sync-limite: JWT + id canônico (mesma base HB para titular com ids duplicados). */
export function resolveHbCreditLimiteSyncTargets(
  user: Pick<User, "role" | "cooperadoId"> | null | undefined,
  data: AppData,
  cooperativaId: string
): { apiCooperadoId: string; cooperadoIds: string[] } | null {
  if (!user?.cooperadoId) return null;
  const apiCooperadoId = resolveHbCreditApiCooperadoId(user, user.cooperadoId);
  const canonico = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  const cooperadoIds =
    canonico && canonico !== apiCooperadoId ? [apiCooperadoId, canonico] : [apiCooperadoId];
  return { apiCooperadoId, cooperadoIds };
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
