"use client";

import { useSyncExternalStore } from "react";
import { getData, subscribe } from "@/services/dataStore";
import type { AppData } from "@/types";

function getServerSnapshot(): AppData | null {
  return null;
}

/** Dados do app com uma única assinatura React (menos re-renders em cascata). */
export function useAppData(): AppData | null {
  return useSyncExternalStore(subscribe, getData, getServerSnapshot);
}

export function useDataRefresh() {
  useSyncExternalStore(subscribe, () => 0, () => 0);
}
