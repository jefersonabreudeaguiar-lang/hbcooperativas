/**
 * Manutenção da fila de fotos offline e publicação local pendente — não dispara sync operacional completo.
 */

import { getSession } from "@/services/dataStore";
import { syncOfflineDeliveryImages } from "@/services/notaPedidoCloudService";
import { listPendingDeliveryImages } from "@/services/offlineImageQueueService";
import { reconcilePendingEntregaPublish } from "@/services/pendingEntregaPublishService";

export const COOPERADO_DELIVERY_QUEUE_FLUSH_EVENT = "hb-cooperado-delivery-queue-flush";

export type CooperadoDeliveryQueueFlushDetail = {
  uploaded: number;
  failed: number;
  offlinePhotosRemaining: number;
  publishReconciled: number;
  publishRemaining: number;
};

let onlineHookAttached = false;
let flushInFlight: Promise<CooperadoDeliveryQueueFlushDetail> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function countCooperadoOfflinePhotosPending(
  notaPedidoId?: string
): Promise<number> {
  const list = await listPendingDeliveryImages(notaPedidoId);
  return list.filter((p) => p.status !== "failed" || p.retryCount < 5).length;
}

export async function runCooperadoDeliveryQueueMaintenance(opts?: {
  cnpj?: string;
}): Promise<CooperadoDeliveryQueueFlushDetail> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const session = getSession();
    const offline = await syncOfflineDeliveryImages();
    const publish = await reconcilePendingEntregaPublish({
      cnpj: opts?.cnpj,
      userId: session?.id,
      userName: session?.name,
    });
    const detail: CooperadoDeliveryQueueFlushDetail = {
      uploaded: offline.uploaded,
      failed: offline.failed,
      offlinePhotosRemaining: offline.remaining,
      publishReconciled: publish.reconciled,
      publishRemaining: publish.remaining,
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(COOPERADO_DELIVERY_QUEUE_FLUSH_EVENT, { detail })
      );
    }
    return detail;
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

function scheduleMaintenance(cnpj?: string): void {
  if (typeof window === "undefined") return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runCooperadoDeliveryQueueMaintenance({ cnpj });
  }, 450);
}

/** Cooperado: ao voltar online, sobe fotos da fila IDB e reconcilia publicação local. */
export function ensureCooperadoDeliveryQueueOnlineListener(cnpj?: string): void {
  if (typeof window === "undefined" || onlineHookAttached) return;
  onlineHookAttached = true;
  window.addEventListener("online", () => scheduleMaintenance(cnpj));
}

export function subscribeCooperadoDeliveryQueueFlush(
  handler: (detail: CooperadoDeliveryQueueFlushDetail) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fn = (ev: Event) => {
    const detail = (ev as CustomEvent<CooperadoDeliveryQueueFlushDetail>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(COOPERADO_DELIVERY_QUEUE_FLUSH_EVENT, fn);
  return () => window.removeEventListener(COOPERADO_DELIVERY_QUEUE_FLUSH_EVENT, fn);
}
