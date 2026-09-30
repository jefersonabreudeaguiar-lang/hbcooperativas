"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { COOPERADO_MOBILE_PREFETCH_HREFS } from "@/lib/hb-credit/hbCreditNavPrefetch";

const PREFETCH_INICIO = "/dashboard";

/** Prefetch HB + Início após idle — troca de aba quase instantânea (Next.js). */
export function HbCreditNavPrefetch() {
  const router = useRouter();
  const { user } = useAuth();
  const hbState = useHbCreditEnabled();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      const routes =
        user.role === "cooperado"
          ? [...COOPERADO_MOBILE_PREFETCH_HREFS]
          : hbState.enabled
            ? ["/conta-coop", PREFETCH_INICIO]
            : [PREFETCH_INICIO];
      for (const href of routes) {
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      }
    };

    let cancelIdle: (() => void) | undefined;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prefetch, { timeout: 8000 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const t = window.setTimeout(prefetch, 2500);
      cancelIdle = () => window.clearTimeout(t);
    }

    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [hbState.enabled, user?.id, user?.role, router]);

  return null;
}
