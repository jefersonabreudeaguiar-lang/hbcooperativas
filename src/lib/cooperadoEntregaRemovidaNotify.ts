/** Aviso ao cooperado quando a cooperativa apagou entrega que estava em análise ou devolvida. */
export const COOPERADO_ENTREGA_REMOVIDA_EVENT = "hb-cooperado-entrega-removida";

export type CooperadoEntregaRemovidaDetail = { count: number };

export function notifyCooperadoEntregasRemovidasPelaCooperativa(count: number): void {
  if (typeof window === "undefined" || count <= 0) return;
  window.dispatchEvent(
    new CustomEvent<CooperadoEntregaRemovidaDetail>(COOPERADO_ENTREGA_REMOVIDA_EVENT, {
      detail: { count },
    })
  );
}
