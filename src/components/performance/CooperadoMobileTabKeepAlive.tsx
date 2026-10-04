"use client";

import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from "react";
import { cn } from "@/utils/format";
import {
  COOPERADO_BOTTOM_TAB_HREFS,
  isCooperadoBottomTabPath,
  isCooperadoMobileTabKeepAliveEnabled,
} from "@/lib/performance/cooperadoMobileTabKeepAlive";

function useCooperadoMobileViewport(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mobile;
}

type Props = {
  pathname: string;
  children: ReactNode;
};

/**
 * RQL 8.6 — mantém as 5 abas do rodapé montadas no mobile cooperado (show/hide).
 * Rotas fora da barra (ex.: menu hamburger) renderizam normalmente; o cache das abas permanece.
 */
export function CooperadoMobileTabKeepAlive({ pathname, children }: Props) {
  const mobile = useCooperadoMobileViewport();
  const enabled = isCooperadoMobileTabKeepAliveEnabled();
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const [, tick] = useState(0);

  const onTab = isCooperadoBottomTabPath(pathname);

  useLayoutEffect(() => {
    if (!enabled || !mobile || !onTab) return;
    cacheRef.current[pathname] = children;
    tick((n) => n + 1);
  }, [enabled, mobile, onTab, pathname, children]);

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string | null) =>
    COOPERADO_BOTTOM_TAB_HREFS.map((href) => {
      const active = activePath === href;
      const panel = active && onTab ? children : cacheRef.current[href];
      if (!panel) return null;
      return (
        <div
          key={href}
          className={cn(!active && "hidden")}
          aria-hidden={!active}
          data-cooperado-tab-panel={href}
        >
          {panel}
        </div>
      );
    });

  if (!onTab) {
    return (
      <>
        <div className="hidden" aria-hidden>{renderPanels(null)}</div>
        {children}
      </>
    );
  }

  return <>{renderPanels(pathname)}</>;
}
