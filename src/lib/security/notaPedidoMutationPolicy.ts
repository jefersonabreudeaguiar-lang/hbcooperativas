import type { NotaPedido } from "@/types";

/** Cooperados só publicam/reenviam a própria entrega enquanto ela está pendente. */
export function podeCooperadoEnviarNota(
  cooperadoId: string | undefined,
  nota: Pick<NotaPedido, "cooperadoId" | "status">,
  existente?: Pick<NotaPedido, "cooperadoId" | "status"> | null
): boolean {
  const actorId = cooperadoId?.trim();
  if (!actorId || nota.cooperadoId !== actorId) return false;
  if (nota.status !== "aguardando_conferencia") return false;
  if (!existente) return true;
  return (
    existente.cooperadoId === actorId &&
    (existente.status === "aguardando_conferencia" || existente.status === "rejeitada")
  );
}
