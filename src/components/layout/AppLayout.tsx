"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, CreditCard, PieChart, Truck, Wallet,
  Percent, Building2, Landmark, Megaphone, MapPin, Car, FileText,
  CalendarCheck, LogOut, Menu, X, Building, ClipboardList, Receipt, User, Tag,
  BookOpen, FileCheck, Shield, MessageSquareWarning,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { getMenuItems, getMobileNavItems, getCooperadoDrawerMenuItems, getUserFuncaoLabel } from "@/permissions";
import { getUserCooperativaNome } from "@/utils/cooperativa";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/utils/constants";
import { AppIcon } from "@/components/ui/AppIcon";
import { cn } from "@/utils/format";
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
  "/reclamacoes": <MessageSquareWarning size={20} />,
  "/livro-caixa": <BookOpen size={20} />,
  "/prestacao-contas": <FileCheck size={20} />,
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
  const { user, logout } = useAuth();
  if (!user) return null;

  const menuItems = mobile && user.role === "cooperado"
    ? getCooperadoDrawerMenuItems(user)
    : getMenuItems(user);

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

      <div className="p-4 border-t border-green-800">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <p className="text-xs text-green-300">{getUserFuncaoLabel(user)}</p>
        </div>
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
  const { user } = useAuth();
  if (!user) return null;

  const mobileItems = getMobileNavItems(user);

  return (
    <>
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-green-900 text-white sticky top-0 z-40">
        <BrandHeader compact />
        <button onClick={() => setOpen(true)} className="p-2 hover:bg-green-800 rounded-lg shrink-0" aria-label="Abrir menu">
          <Menu size={22} />
        </button>
      </header>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-72 h-full">
            <Sidebar mobile onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex safe-area-pb bg-white border-t-2 border-green-200 shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
        {mobileItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const isCooperadoNav = user.role === "cooperado";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center min-w-0 px-0.5 transition-colors",
                isCooperadoNav ? "min-h-[72px] py-2 gap-1" : "py-2 text-[10px] sm:text-xs gap-0.5",
                active
                  ? isCooperadoNav
                    ? "text-green-800 bg-green-50"
                    : "text-green-700"
                  : isCooperadoNav
                    ? "text-gray-700"
                    : "text-gray-500"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-xl transition-colors",
                  isCooperadoNav && "w-11 h-11",
                  active && isCooperadoNav ? "bg-green-700 text-white" : active ? "text-green-700" : isCooperadoNav ? "text-green-700" : "text-gray-400"
                )}
              >
                {navIcon(item.href, item.resource, isCooperadoNav ? 24 : 20)}
              </span>
              <span
                className={cn(
                  "truncate w-full text-center leading-tight",
                  isCooperadoNav
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
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-28 lg:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
