import type { NotaPedidoStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";

const NOTA_BADGE: Record<NotaPedidoStatus, string> = {
  rascunho: "pendente",
  entregue: "entregue",
  aguardando_conferencia: "aguardando_analise",
  conferida: "aprovada",
  rejeitada: "precisa_corrigir",
  pago: "pago",
  cancelado: "cancelado",
};

export function NotaStatusBadge({ status }: { status: NotaPedidoStatus }) {
  return <StatusBadge status={NOTA_BADGE[status]} />;
}
