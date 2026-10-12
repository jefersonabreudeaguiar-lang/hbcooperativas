"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
const PREFETCH_INICIO = "/dashboard";

/** Prefetch de rotas do cooperado em camadas + staff/HB após idle. */
export function HbCreditNavPrefetch() {
  const router = useRouter();
  const { user } = useAuth();
  const hbState = useHbCreditEnabled();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    if (user.role === "cooperado") {
      const routes = ["/minha-conta-coop", "/minha-conta-coop/escanear", "/minha-conta-coop/pagar"];
      const prefetchCoop = () => {
        if (cancelled) return;
        for (const href of routes) {
          try {
            router.prefetch(href);
          } catch {
            /* ignore */
          }
        }
      };
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(prefetchCoop, { timeout: 1500 });
        return () => {
          cancelled = true;
          window.cancelIdleCallback(id);
        };
      }
      const t = window.setTimeout(prefetchCoop, 400);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

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
