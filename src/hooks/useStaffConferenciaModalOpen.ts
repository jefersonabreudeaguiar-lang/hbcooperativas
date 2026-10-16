"use client";

import { useSyncExternalStore } from "react";
import {
  isStaffConferenciaModalOpen,
  subscribeStaffConferenciaModalOpen,
} from "@/lib/performance/staffConferenciaSyncTier";

export function useStaffConferenciaModalOpen(): boolean {
  return useSyncExternalStore(
    subscribeStaffConferenciaModalOpen,
    isStaffConferenciaModalOpen,
    () => false
  );
}
