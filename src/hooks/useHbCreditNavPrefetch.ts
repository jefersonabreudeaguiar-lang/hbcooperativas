"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import {
  scheduleCooperadoNavPrefetchEarly,
} from "@/lib/performance/cooperadoNavPrefetch";

const PREFETCH_INICIO = "/dashboard";

/** Prefetch de rotas do cooperado em camadas + staff/HB após idle. */
export function HbCreditNavPrefetch() {
  const router = useRouter();
  const { user } = useAuth();
  const hbState = useHbCreditEnabled();

  useEffect(() => {
    if (!user) return;

    if (user.role === "cooperado") {
      return scheduleCooperadoNavPrefetchEarly(router);
    }

    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      const routes = hbState.enabled ? ["/conta-coop", PREFETCH_INICIO] : [PREFETCH_INICIO];
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
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const t = window.setTimeout(prefetch, 800);
      cancelIdle = () => window.clearTimeout(t);
    }

    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [hbState.enabled, user?.id, user?.role, router]);

  return null;
}
