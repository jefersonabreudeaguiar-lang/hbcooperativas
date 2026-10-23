"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";

/**
 * Se o painel cooperado ficar vazio (chunk/TDZ), oferece reparo visível — não depende de F12.
 */
export function CooperadoPainelPaintWatchdog() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user || !isCooperadoAppUser(user)) {
      setShow(false);
      return;
    }
    const path = pathname ?? "";
    const onPainel =
      isCooperadoBottomTabPath(path) || path === "/dashboard" || path.startsWith("/dashboard/");
    if (!onPainel) {
      setShow(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const main = document.querySelector("main");
      const text = (main?.innerText ?? "").replace(/\s+/g, " ").trim();
      const hasActivePanel = Boolean(
        document.querySelector("[data-cooperado-tab-panel-active='1']")
      );
      if (text.length > 48 || hasActivePanel) return;
      setShow(true);
    }, 3_000);

    return () => {
      window.clearTimeout(timer);
      setShow(false);
    };
  }, [user?.id, user?.role, pathname]);

  if (!show) return null;

  const rescueHref = `/pwa-rescue.html?auto=1&next=${encodeURIComponent(
    `/login?hb-pwa=${APP_BUILD_VERSION}&next=${encodeURIComponent("/dashboard")}`
  )}`;

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center"
      role="alertdialog"
      aria-labelledby="hb-coop-paint-watchdog-title"
    >
      <h1 id="hb-coop-paint-watchdog-title" className="text-lg font-bold text-gray-900">
        O painel não carregou
      </h1>
      <p className="text-sm text-gray-600 max-w-sm">
        Isso costuma ser cache do app após atualização (build {APP_BUILD_VERSION}). Toque em reparar — não apaga sua senha.
      </p>
      <a
        href={rescueHref}
        className="inline-flex items-center justify-center rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white"
      >
        Reparar e abrir de novo
      </a>
    </div>
  );
}
