"use client";

import { useEffect, useRef } from "react";
import { runClientReleaseAlignment } from "@/lib/pwa/fetchOfficialClientRelease";

const RETRY_MS = [300, 700, 1400, 2800, 5000];

export function ClientDeploymentGuard() {
  const aligningRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = async (): Promise<"stop" | "retry"> => {
      if (aligningRef.current) return "stop";
      const result = await runClientReleaseAlignment();
      if (result === "aligning") {
        aligningRef.current = true;
        return "stop";
      }
      if (result === "pending") return "retry";
      return "stop";
    };

    let cancelled = false;
    const timeouts: number[] = [];

    void run().then((next) => {
      if (next !== "retry" || cancelled) return;
      for (const ms of RETRY_MS) {
        const id = window.setTimeout(() => {
          if (cancelled || aligningRef.current) return;
          void run();
        }, ms);
        timeouts.push(id);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible" && !aligningRef.current) void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      if (!aligningRef.current) void run();
    }, 4 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, []);

  return null;
}
