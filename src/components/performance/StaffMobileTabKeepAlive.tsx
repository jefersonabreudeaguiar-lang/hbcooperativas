"use client";

import { Activity, memo, useId, useLayoutEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { markStaffTabPathChange } from "@/lib/staff/staffTabSwitchQuiescence";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useStaffMobileViewport } from "@/lib/performance/staffMobileViewport";
import { isStaffMobileTabKeepAliveEnabled, trimStaffTabCacheOrder } from "@/lib/performance/staffMobileTabKeepAlive";

const loading = () => <PageSkeleton compact />;
// Componentes de folha: guardar children do App Router preservava só o invólucro,
// que muda de conteúdo com a rota e não mantém o estado da tela anterior.
const panels = {
  "/dashboard": dynamic(() => import("@/app/(app)/dashboard/DashboardContent"), { loading }),
  "/notas-pedido": dynamic(() => import("@/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp"), { loading }),
  "/ficha-corrida": dynamic(() => import("@/app/(app)/ficha-corrida/FichaCorridaContent"), { loading }),
  "/livro-caixa": dynamic(() => import("@/app/(app)/livro-caixa/LivroCaixaContent"), { loading }),
  "/cooperados": dynamic(() => import("@/app/(app)/cooperados/CooperadosContent"), { loading }),
  "/conta-coop": dynamic(() => import("@/app/(app)/conta-coop/ContaCoopContent"), { loading }),
};
type PanelHref = keyof typeof panels;
const isPanel = (path: string): path is PanelHref => Object.hasOwn(panels, path);
const desktopPanels = new Set<string>(["/dashboard", "/ficha-corrida", "/livro-caixa"]);

const RetainedPanel = memo(function RetainedPanel({ href, active }: { href: PanelHref; active: boolean }) {
  const instance = useId();
  const Panel = panels[href];
  return <Activity mode={active ? "visible" : "hidden"} name={href}>
    <div data-staff-tab-panel={href} data-staff-tab-panel-active={active ? "1" : "0"} data-staff-tab-instance={instance}>
      <Panel />
    </div>
  </Activity>;
});

/** Abas visitadas mantêm estado; Activity pausa efeitos e assinaturas quando ocultas. */
export function StaffMobileTabKeepAlive({ pathname, children }: { pathname: string; children: ReactNode }) {
  const enabled = isStaffMobileTabKeepAliveEnabled();
  const mobile = useStaffMobileViewport();
  const [mobileVisited, setMobileVisited] = useState<string[]>([]);
  const [desktopVisited, setDesktopVisited] = useState<string[]>([]);
  const visited = mobile ? mobileVisited : desktopVisited;
  const setVisited = mobile ? setMobileVisited : setDesktopVisited;
  const activeKey = isPanel(pathname) && (mobile || desktopPanels.has(pathname)) ? pathname : null;
  const retained = activeKey
    ? mobile
      ? trimStaffTabCacheOrder([activeKey, ...visited], activeKey, 6, false)
      : [activeKey, ...visited.filter((href) => href !== activeKey)].slice(0, 2)
    : visited;

  useLayoutEffect(() => {
    if (!enabled || !mobile) return;
    markStaffTabPathChange(pathname);
  }, [enabled, mobile, pathname, activeKey]);

  // Ajuste derivado da rota antes do commit: evita um segundo commit de layout.
  if (enabled && activeKey && visited[0] !== activeKey) setVisited(retained);
  if (!enabled) return <>{children}</>;
  return <CooperadoTabPanelProvider activeHref={pathname}>
    {retained.filter(isPanel).map(href => <RetainedPanel key={href} href={href} active={href === activeKey} />)}
    {!activeKey && children}
  </CooperadoTabPanelProvider>;
}
