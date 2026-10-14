import type { User } from "@/types";
import { scheduleCooperadoFinanceiroDisplayWarmup } from "@/lib/cooperado/cooperadoFinanceiroDisplayWarmup";

let bootstrapUserId: string | null = null;

/** Uma vez por sessão — delega ao warmup de exibição (cache + sync leve, padrão HB). */
export function scheduleCooperadoPilotFinanceBootstrapOnce(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado") return;
  if (bootstrapUserId === user.id) return;
  bootstrapUserId = user.id;
  scheduleCooperadoFinanceiroDisplayWarmup(user);
}

/** @internal testes */
export function resetCooperadoPilotFinanceBootstrapForTests(): void {
  bootstrapUserId = null;
}
