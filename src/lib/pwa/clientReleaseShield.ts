"use client";

import { applyOfficialReleaseIfNeeded } from "@/lib/pwa/fetchOfficialClientRelease";

export type ReleaseShieldResult = "ok" | "aligning" | "pending";

/** Retentativas só enquanto o app estiver desalinhado (não é polling em versão OK). */
const MISALIGNED_RETRY_MS = [1_500, 4_000, 10_000, 25_000, 45_000];

let inFlight: Promise<ReleaseShieldResult> | null = null;
let misalignedAttempt = 0;
let misalignedTimer = 0;
let aligning = false;

function stopMisalignedRetries(): void {
  misalignedAttempt = 0;
  if (misalignedTimer) {
    window.clearTimeout(misalignedTimer);
    misalignedTimer = 0;
  }
}

function scheduleMisalignedRetry(trigger: string): void {
  if (aligning || typeof window === "undefined") return;
  if (document.visibilityState === "hidden") return;
  const delay = MISALIGNED_RETRY_MS[Math.min(misalignedAttempt, MISALIGNED_RETRY_MS.length - 1)];
  misalignedAttempt += 1;
  if (misalignedTimer) window.clearTimeout(misalignedTimer);
  misalignedTimer = window.setTimeout(() => {
    misalignedTimer = 0;
    void runClientReleaseShield(`${trigger}:retry${misalignedAttempt}`);
  }, delay);
}

/**
 * Blindagem de release — ponto único para boot, foco, rede, aba e SW.
 * Repete com backoff até alinhar ou iniciar reload.
 */
export async function runClientReleaseShield(trigger: string): Promise<ReleaseShieldResult> {
  if (typeof window === "undefined") return "ok";
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const result = await applyOfficialReleaseIfNeeded();
    if (result === "aligning") {
      aligning = true;
      stopMisalignedRetries();
      return "aligning";
    }
    if (result === "ok") {
      aligning = false;
      stopMisalignedRetries();
      return "ok";
    }
    scheduleMisalignedRetry(trigger);
    return "pending";
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function bindClientReleaseShieldEvents(run: (trigger: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onVisible = () => {
    if (document.visibilityState === "visible") run("visibility");
  };
  const onPageShow = (ev: PageTransitionEvent) => {
    if (ev.persisted) run("pageshow_bfcache");
  };
  const onOnline = () => run("online");
  const onFocus = () => run("focus");

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
  };
}
