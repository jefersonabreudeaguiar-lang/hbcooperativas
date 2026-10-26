import { useSyncExternalStore } from "react";

const STAFF_MOBILE_MQ = "(max-width: 1023px)";

function subscribeStaffMobileViewport(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const mq = window.matchMedia(STAFF_MOBILE_MQ);
  const handler = () => onStoreChange();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

function getStaffMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(STAFF_MOBILE_MQ).matches;
}

export function isStaffMobileViewportActive(): boolean {
  return getStaffMobileViewportSnapshot();
}

/** Gestão: keep-alive de abas só no mobile — desktop usa rota única (evita 4 árvores pesadas). */
export function useStaffMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeStaffMobileViewport,
    getStaffMobileViewportSnapshot,
    () => false
  );
}
