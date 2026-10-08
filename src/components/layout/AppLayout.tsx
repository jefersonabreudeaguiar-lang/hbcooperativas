"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, CreditCard, PieChart, Truck, Wallet,
  Percent, Building2,   Landmark, Megaphone, MapPin, Car, FileText,
  CalendarCheck, LogOut, Menu, X, Building, ClipboardList, Receipt, User, Tag,
  BookOpen, FileCheck, Shield, MessageSquareWarning, Vote, Download, ShoppingCart, Scale,
} from "lucide-react";
import { useEffect, useLayoutEffect, useState, startTransition } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import {
  AppShellNavigationProvider,
  useAppShellNavigationContext,
} from "@/components/layout/AppShellNavigationContext";
import { getUserFuncaoLabel, isCooperadoAppUser, resolveAppUserRole } from "@/permissions";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaNome } from "@/utils/cooperativa";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/utils/constants";
import { AppIcon } from "@/components/ui/AppIcon";
import {
  SyncStatusChip,
  SyncStatusChipLight,
  StaffSidebarSyncVersionLine,
} from "@/components/sync/SyncStatusChip";
import { CooperadoSubtleUpdateNotice } from "@/components/cooperado/CooperadoSubtleUpdateNotice";
import { CobrancaSaasPainel } from "@/components/payments/CobrancaSaasPainelWrapper";
import { PainelResponsavelMobileBar } from "@/components/permissions/PainelResponsavelMobileBar";
import { ContratoServicoAppGate } from "@/components/cobranca/ContratoServicoAppGate";
import { cn } from "@/utils/format";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { useSyncContaCoopValorReceberCooperativa } from "@/hooks/useSyncContaCoopValorReceberCooperativa";
import { isStaffHbCoopBackgroundSyncRoute } from "@/lib/hb-credit/staffHbSyncRoute";
import { AppUpdateBanner } from "@/components/pwa/AppUpdateBanner";
import { useHbCreditDescontosWarmup } from "@/hooks/useHbCreditDescontosWarmup";
import { shouldPrefetchHbCreditNav } from "@/lib/hb-credit/hbCreditNavPrefetch";
import { scheduleCooperadoNavPrefetchEarly } from "@/lib/performance/cooperadoNavPrefetch";
import { COOPERADO_FINANCEIRO_TAB_HREF } from "@/lib/hb-credit/hbCreditNavPrefetch";
import { cooperadoTabWarmOnPointerDown } from "@/lib/performance/cooperadoTabPointerWarmup";
import { staffTabWarmOnPointerDown } from "@/lib/performance/staffTabPointerWarmup";
import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";
import { isStaffBottomTabPath } from "@/lib/performance/staffBottomTabRoutes";
import { scheduleStaffNavPrefetchEarly } from "@/lib/performance/staffNavPrefetch";
import { prefetchStaffNotasPedidoRouteBundle } from "@/lib/performance/prefetchStaffNotasPedidoUi";
import { useMobileBottomTabSwitchFeedback } from "@/lib/performance/tabSwitchFeedback";
import {
  markRqlShellInteractive,
  markRqlShellVisual,
} from "@/lib/performance/rqlMarks";
import { CooperadoFinanceiroSyncBanner } from "@/components/cooperado/CooperadoFinanceiroShellContext";
import { useMobileTabScrollRestore } from "@/hooks/useMobileTabScrollRestore";
import type { MobileTabScrollMode } from "@/lib/performance/mobileTabScrollMemory";
import { CooperadoMobileTabKeepAlive } from "@/components/performance/CooperadoMobileTabKeepAlive";
import { StaffMobileTabKeepAlive } from "@/components/performance/StaffMobileTabKeepAlive";
import { CooperadoMobileReleaseBar } from "@/components/cooperado/CooperadoMobileReleaseBar";
import { StaffMobileReleaseBar } from "@/components/layout/StaffMobileReleaseBar";
import type { Resource } from "@/types";

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={20} />,
  "/dashboard": <LayoutDashboard size={20} />,
  "/notas-pedido": <ClipboardList size={20} />,
  "/ficha-corrida": <Receipt size={20} />,
  "/meu-cadastro": <User size={20} />,
  "/precos": <Tag size={20} />,
  "/contratos": <FileText size={20} />,
  "/meu-perfil": <Building size={20} />,
  "/admin": <Shield size={20} />,
  "/comunicados": <Megaphone size={20} />,
  "/votacoes": <Vote size={20} />,
  "/reclamacoes": <MessageSquareWarning size={20} />,
  "/livro-caixa": <BookOpen size={20} />,
  "/prestacao-contas": <FileCheck size={20} />,
  "/conta-coop": <Wallet size={20} />,
  "/minha-conta-coop": <Wallet size={20} />,
  "/mercado-parceiro": <ShoppingCart size={20} />,
  "/contador/dashboard": <Shield size={20} />,
  "/contador/conciliacao": <Scale size={20} />,
  "/contador/trilha-auditoria": <FileCheck size={20} />,
  "/contador/parecer": <FileText size={20} />,
  contador: <Shield size={20} />,
  conta_coop: <Wallet size={20} />,
  "/cooperativas": <Building size={20} />,
  "/cooperados": <Users size={20} />,
  "/instituicoes": <Building2 size={20} />,
  cooperativas: <Building size={20} />,
  cooperados: <Users size={20} />,
  mensalidades: <CreditCard size={20} />,
  cotas: <PieChart size={20} />,
  entregas: <Truck size={20} />,
  pagamentos: <Wallet size={20} />,
  descontos: <Percent size={20} />,
  instituicoes: <Building2 size={20} />,
  notas_pedido: <ClipboardList size={20} />,
  ficha_corrida: <Receipt size={20} />,
  financeiro: <Landmark size={20} />,
  comunicados: <Megaphone size={20} />,
  votacoes: <Vote size={20} />,
  reclamacoes: <MessageSquareWarning size={20} />,
  propriedades: <MapPin size={20} />,
  veiculos: <Car size={20} />,
  relatorios: <FileText size={20} />,
  fechamento: <CalendarCheck size={20} />,
  livro_caixa: <BookOpen size={20} />,
  prestacao_contas: <FileCheck size={20} />,
};

function navIcon(href: string, resource: Resource, size = 20) {
  const icon = ICONS[href] ?? ICONS[resource] ?? <LayoutDashboard size={size} />;
  if (size === 20) return icon;
  const IconComponent =
    href === "/dashboard" || resource === "dashboard" ? LayoutDashboard :
    href === "/notas-pedido" || resource === "notas_pedido" ? ClipboardList :
    href === "/precos" || resource === "instituicoes" ? Tag :
    href === "/ficha-corrida" || resource === "ficha_corrida" ? Receipt :
    href === "/mensalidades" || resource === "mensalidades" ? CreditCard :
    LayoutDashboard;
  return <IconComponent size={size} />;
}

function BrandHeader({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const coopNome = useAppDataSelector(
    (data) => (user ? getUserCooperativaNome(user, data) : ""),
    [user?.id, user?.cooperativaId, user?.role]
  );

  return (
    <div className="flex items-center gap-3">
      <AppIcon size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <p className={cn("font-bold leading-tight truncate", compact ? "text-sm" : "text-sm")}>{PLATFORM_NAME}</p>
        <p className="text-xs text-green-300 truncate">
          {coopNome || PLATFORM_TAGLINE}
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const shell = useAppShellNavigationContext();
  if (!shell) return null;
  const { navUser, desktopMenu, drawerMenu } = shell;
  const menuItems = mobile && isCooperadoAppUser(navUser) ? drawerMenu : desktopMenu;
  const staffUser = navUser && !isCooperadoAppUser(navUser);

  return (
    <aside className={cn(
      "flex flex-col bg-green-900 text-white h-full",
      mobile ? "w-full" : "w-64 hidden lg:flex"
    )}>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-green-800">
        <BrandHeader />
        {mobile && onClose && (
          <button onClick={onClose} className="ml-auto p-1 hover:bg-green-800 rounded-lg" aria-label="Fechar menu">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {menuItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={shouldPrefetchHbCreditNav(item.href)}
              onPointerEnter={
                staffUser && item.href === "/notas-pedido"
                  ? () => prefetchStaffNotasPedidoRouteBundle()
                  : undefined
              }
              onFocus={
                staffUser && item.href === "/notas-pedido"
                  ? () => prefetchStaffNotasPedidoRouteBundle()
                  : undefined
              }
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-green-700 text-white" : "text-green-200 hover:bg-green-800 hover:text-white"
              )}
            >
              {navIcon(item.href, item.resource)}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-green-800 space-y-1">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium truncate">{navUser.name}</p>
          <p className="text-xs text-green-300">{getUserFuncaoLabel(navUser)}</p>
        </div>
        {!isCooperadoAppUser(navUser) && <StaffSidebarSyncVersionLine />}
        <Link
          href="/baixar-app"
          onClick={onClose}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-200 hover:bg-green-800 hover:text-white rounded-lg transition-colors"
        >
          <Download size={18} />
          Baixar app (Android e iPhone)
        </Link>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-200 hover:bg-green-800 hover:text-white rounded-lg transition-colors"
          title="Encerra sua sessão neste dispositivo"
        >
          <LogOut size={18} />
          Desconectar
        </button>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const shell = useAppShellNavigationContext();
  const navUser = shell?.navUser;
  const mobileItems = shell?.mobileMenu ?? [];

  useLayoutEffect(() => {
    if (!navUser || !isCooperadoAppUser(navUser)) return;
    markRqlShellVisual();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        markRqlShellInteractive();
      });
    });
  }, [navUser?.id, navUser?.role]);

  useEffect(() => {
    if (!navUser) return;
    if (isCooperadoAppUser(navUser)) {
      return scheduleCooperadoNavPrefetchEarly(router);
    }
    return scheduleStaffNavPrefetchEarly(router);
  }, [navUser?.id, navUser?.role, router]);

  const bottomTabProfile = navUser
    ? isCooperadoAppUser(navUser)
      ? "cooperado"
      : "staff"
    : null;
  useMobileBottomTabSwitchFeedback(pathname, bottomTabProfile);

  if (!shell || !navUser) return null;

  return (
    <>
      <header className="lg:hidden flex items-center justify-between gap-2 px-4 py-3 bg-green-900 text-white sticky top-0 z-40">
        <BrandHeader compact />
        <div className="flex items-center gap-1.5 shrink-0">
          {!isCooperadoAppUser(navUser) && <SyncStatusChip showBuild />}
          <button onClick={() => setOpen(true)} className="p-2 hover:bg-green-800 rounded-lg" aria-label="Abrir menu">
            <Menu size={22} />
          </button>
        </div>
      </header>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-72 h-full">
            <Sidebar mobile onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex flex-col safe-area-pb shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
        {isCooperadoAppUser(navUser) && <CooperadoMobileReleaseBar />}
        <nav className="flex bg-white border-t-2 border-green-200">
        {mobileItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const isCooperadoNav = isCooperadoAppUser(navUser);
          const mobileTabUx = isCooperadoNav || isStaffBottomTabPath(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              prefetch={
                isCooperadoNav
                  ? item.href === COOPERADO_FINANCEIRO_TAB_HREF || isCooperadoBottomTabPath(item.href)
                  : isStaffBottomTabPath(item.href) || item.href === "/notas-pedido"
              }
              onPointerDown={() => {
                if (isCooperadoNav && isCooperadoBottomTabPath(item.href)) {
                  cooperadoTabWarmOnPointerDown(item.href);
                  try {
                    router.prefetch(item.href);
                  } catch {
                    /* ignore */
                  }
                } else if (!isCooperadoNav) {
                  staffTabWarmOnPointerDown(item.href);
                }
              }}
              onClick={(e) => {
                // Cooperado: navegação nativa do Link (sem startTransition) — paint mais rápido no PWA.
                if (!active && mobileTabUx && !isCooperadoNav) {
                  e.preventDefault();
                  startTransition(() => {
                    router.push(item.href);
                  });
                }
              }}
              className={cn(
                "flex-1 flex flex-col items-center justify-center min-w-0 px-0.5 select-none hb-mobile-tab-link",
                mobileTabUx ? "min-h-[72px] py-2 gap-1" : "py-2 text-[10px] sm:text-xs gap-0.5",
                active
                  ? mobileTabUx
                    ? "text-green-800 bg-green-50"
                    : "text-green-700"
                  : mobileTabUx
                    ? "text-gray-700"
                    : "text-gray-500"
              )}
            >
              <span
                data-hb-tab-icon={mobileTabUx ? "" : undefined}
                className={cn(
                  "flex items-center justify-center rounded-xl",
                  mobileTabUx && "w-11 h-11",
                  active && mobileTabUx
                    ? "bg-green-700 text-white"
                    : active
                      ? "text-green-700"
                      : mobileTabUx
                        ? "text-green-700"
                        : "text-gray-400"
                )}
              >
                {navIcon(item.href, item.resource, mobileTabUx ? 24 : 20)}
              </span>
              <span
                className={cn(
                  "truncate w-full text-center leading-tight",
                  mobileTabUx
                    ? cn("text-[11px] sm:text-xs px-0.5", active ? "font-bold text-green-900" : "font-semibold")
                    : ""
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        </nav>
      </div>

      {!isCooperadoAppUser(navUser) && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <StaffMobileReleaseBar />
        </div>
      )}
    </>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mercadoQrImmersive = pathname === "/mercado-parceiro/cobrar";
  const shell = useAppShellNavigationContext();
  const navUser = shell?.navUser ?? null;
  const coopId = shell?.coopId;
  const staffPainelUi = shell?.staffPainelUi ?? false;
  const credit = useHbCreditEnabled(navUser);
  const staffHbSync =
    staffPainelUi &&
    navUser &&
    coopId &&
    (navUser.role === "responsavel" || navUser.role === "tesoureiro" || navUser.role === "admin");
  /** Ficha-descontos em lote — só relatórios; `/conta-coop` usa APIs próprias da página HB. */
  const staffCoopBackgroundSync = isStaffHbCoopBackgroundSyncRoute(pathname);

  const cooperadoKeepAliveShell =
    Boolean(navUser) &&
    isCooperadoAppUser(navUser) &&
    (isAppDataWarm()
      ? resolveAppUserRole(navUser!, getData()) === "cooperado"
      : navUser!.role === "cooperado");

  const staffKeepAliveShell =
    Boolean(navUser) &&
    staffPainelUi &&
    !isCooperadoAppUser(navUser);

  const mobileTabScrollMode: MobileTabScrollMode = cooperadoKeepAliveShell
    ? "cooperado"
    : staffKeepAliveShell
      ? "staff"
      : "none";
  const mainScrollRef = useMobileTabScrollRestore({
    pathname,
    scrollMode: mobileTabScrollMode,
  });

  useLayoutEffect(() => {
    try {
      if (!navUser) {
        document.documentElement.setAttribute("data-hb-shell-mode", "loading");
        return;
      }
      const role = isAppDataWarm()
        ? resolveAppUserRole(navUser, getData())
        : navUser.role;
      document.documentElement.setAttribute("data-hb-shell-mode", role);
      document.documentElement.setAttribute(
        "data-hb-keep-alive-wrap",
        cooperadoKeepAliveShell || staffKeepAliveShell ? "1" : "0"
      );
      const cooperadoMobile =
        isCooperadoAppUser(navUser) &&
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 1023px)").matches;
      if (!cooperadoMobile) {
        markRqlShellVisual();
        markRqlShellInteractive();
      }
    } catch {
      /* ignore */
    }
  }, [navUser, cooperadoKeepAliveShell, staffKeepAliveShell]);

  useSyncContaCoopValorReceberCooperativa(
    staffHbSync && credit.enabled && staffCoopBackgroundSync
      ? { cooperativaId: coopId, user: navUser, enabled: true }
      : undefined
  );

  useHbCreditDescontosWarmup(navUser);

  const router = useRouter();
  useEffect(() => {
    if (!navUser || isCooperadoAppUser(navUser)) return;
    return scheduleStaffNavPrefetchEarly(router);
  }, [navUser?.id, navUser?.role, router]);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] bg-gray-50 overflow-hidden">
      <AppUpdateBanner />
      {navUser && <CooperadoSubtleUpdateNotice />}
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!mercadoQrImmersive && <MobileNav />}
        <main
          ref={mainScrollRef}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain",
            mercadoQrImmersive
              ? "p-0 pb-0"
              : cn(
                  "p-4 lg:p-6 lg:pb-6",
                  navUser && isCooperadoAppUser(navUser)
                    ? "pb-[max(10.5rem,env(safe-area-inset-bottom,0px)+6.75rem)]"
                    : "pb-[max(6.5rem,env(safe-area-inset-bottom,0px)+4.25rem)] lg:pb-6"
                )
          )}
        >
          {navUser && !isCooperadoAppUser(navUser) && (
            <div className="flex justify-end mb-2 lg:mb-3">
              <div className="hidden lg:flex">
                <SyncStatusChipLight />
              </div>
            </div>
          )}
          <PainelResponsavelMobileBar />
          <ContratoServicoAppGate />
          <CobrancaSaasPainel />
          {navUser && isCooperadoAppUser(navUser) && <CooperadoFinanceiroSyncBanner />}
          {cooperadoKeepAliveShell ? (
            <CooperadoMobileTabKeepAlive pathname={pathname}>{children}</CooperadoMobileTabKeepAlive>
          ) : staffKeepAliveShell ? (
            <StaffMobileTabKeepAlive pathname={pathname}>{children}</StaffMobileTabKeepAlive>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShellNavigationProvider>
      <AppShellInner>{children}</AppShellInner>
    </AppShellNavigationProvider>
  );
}
