export const HB_FICHA_PLANO_UPDATED_EVENT = "hb-ficha-plano-updated";

export function notifyHbFichaPlanoUpdated(cooperadoId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HB_FICHA_PLANO_UPDATED_EVENT, { detail: { cooperadoId } })
  );
}
