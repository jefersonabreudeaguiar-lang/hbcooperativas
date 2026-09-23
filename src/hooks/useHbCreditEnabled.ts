"use client";

import { useEffect, useState } from "react";
import { isHbCreditEnabledClient } from "@/modules/hb-credit/config";

export type HbCreditFlagStatus = "loading" | "enabled" | "disabled" | "error";

export interface HbCreditFlagState {
  /** Módulo habilitado e confirmado pelo servidor — use para menu e gates. */
  enabled: boolean;
  status: HbCreditFlagStatus;
  loading: boolean;
  clientFlag: boolean;
  serverConfirmed: boolean;
  errorMessage: string | null;
}

const STATUS_FETCH_TIMEOUT_MS = 12_000;
const STATUS_CACHE_KEY = "hb_credit_status_v1";
const STATUS_CACHE_TTL_MS = 10 * 60 * 1000;

function readCachedHbCreditStatus(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { enabled?: boolean; at?: number };
    if (!parsed.at || Date.now() - parsed.at > STATUS_CACHE_TTL_MS) return null;
    if (parsed.enabled === true) return true;
    if (parsed.enabled === false) return false;
    return null;
  } catch {
    return null;
  }
}

function writeCachedHbCreditStatus(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ enabled, at: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

const shared = {
  serverEnabled: null as boolean | null,
  errorMessage: null as string | null,
};

const statusListeners = new Set<() => void>();
let statusFetchInFlight: Promise<void> | null = null;

function notifyHbCreditStatusListeners() {
  statusListeners.forEach((l) => l());
}

function seedSharedFromCache() {
  if (shared.serverEnabled !== null) return;
  const cached = readCachedHbCreditStatus();
  if (cached !== null) shared.serverEnabled = cached;
}

async function fetchHbCreditStatusOnce(signal: AbortSignal) {
  try {
    const res = await fetch("/api/credit/status", { cache: "no-store", signal });
    if (!res.ok) {
      shared.serverEnabled = null;
      shared.errorMessage = `Status HTTP ${res.status}`;
      notifyHbCreditStatusListeners();
      return;
    }
    const data = (await res.json()) as { enabled?: boolean };
    const enabled = data.enabled === true;
    shared.serverEnabled = enabled;
    shared.errorMessage = null;
    writeCachedHbCreditStatus(enabled);
    notifyHbCreditStatusListeners();
  } catch (e) {
    if (signal.aborted) return;
    shared.serverEnabled = null;
    shared.errorMessage = e instanceof Error ? e.message : "Falha de rede ao consultar status.";
    notifyHbCreditStatusListeners();
  }
}

function ensureHbCreditStatusFetch() {
  if (statusFetchInFlight) return statusFetchInFlight;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
  statusFetchInFlight = fetchHbCreditStatusOnce(controller.signal).finally(() => {
    window.clearTimeout(timeout);
    statusFetchInFlight = null;
  });
  return statusFetchInFlight;
}

export function useHbCreditEnabled(): HbCreditFlagState {
  const clientFlag = isHbCreditEnabledClient();
  const [, bump] = useState(0);

  useEffect(() => {
    seedSharedFromCache();
    const listener = () => bump((n) => n + 1);
    statusListeners.add(listener);
    void ensureHbCreditStatusFetch();
    return () => {
      statusListeners.delete(listener);
    };
  }, []);

  const serverEnabled = shared.serverEnabled;
  const errorMessage = shared.errorMessage;

  let status: HbCreditFlagStatus;
  if (serverEnabled === null && !errorMessage) {
    status = "loading";
  } else if (errorMessage) {
    status = "error";
  } else if (serverEnabled === true) {
    status = "enabled";
  } else {
    status = "disabled";
  }

  /** Visibilidade exige confirmação explícita do servidor — fail-closed. */
  const enabled = status === "enabled";

  return {
    enabled,
    status,
    loading: status === "loading",
    clientFlag,
    serverConfirmed: serverEnabled === true,
    errorMessage,
  };
}

/** Menu HB Créditos: reexporta regra central de permissions. */
export { isHbCreditNavVisible } from "@/permissions";
