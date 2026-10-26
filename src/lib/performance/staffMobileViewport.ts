"use client";

import { useSyncExternalStore } from "react";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewportCore";

export { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewportCore";

const STAFF_MOBILE_MQ = "(max-width: 1023px)";

function subscribeStaffMobileViewport(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(STAFF_MOBILE_MQ);
  const handler = () => onStoreChange();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

function getStaffMobileViewportSnapshot(): boolean {
  return isStaffMobileViewportActive();
}

/** Gestão: keep-alive de abas só no mobile — desktop usa rota única (evita 4 árvores pesadas). */
export function useStaffMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeStaffMobileViewport,
    getStaffMobileViewportSnapshot,
    () => false
  );
}
