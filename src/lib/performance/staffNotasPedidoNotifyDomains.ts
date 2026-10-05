import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";

export type StaffNotasPedidoNotifyInput = {
  isCooperado: boolean;
  vistaResponsavel: "fila" | "cooperado" | "historico" | "correcoes" | "aberto";
  conferirModal: boolean;
  anexarModal: boolean;
  abaCooperado: "entregas" | "ficha";
};

/** Domínios mínimos para re-render do painel — evita repaint em sync operacional/financeiro irrelevante. */
export function resolveStaffNotasPedidoNotifyDomains(
  input: StaffNotasPedidoNotifyInput
): AppDataNotifyDomain[] {
  const out = new Set<AppDataNotifyDomain>(["shell", "notas"]);
  if (input.isCooperado) {
    if (input.abaCooperado === "ficha" || input.anexarModal) out.add("financeiro");
    return [...out];
  }
  if (
    input.conferirModal ||
    input.vistaResponsavel === "historico" ||
    input.vistaResponsavel === "correcoes" ||
    input.vistaResponsavel === "aberto"
  ) {
    out.add("financeiro");
  }
  return [...out];
}
