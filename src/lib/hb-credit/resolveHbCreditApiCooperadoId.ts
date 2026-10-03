import type { User } from "@/types";

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
