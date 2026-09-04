"use client";

import {
  LayoutDashboard,
  Banknote,
  Wallet,
  Building2,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/format";

export type AdminSection = "inicio" | "cobranca" | "conta-coop" | "cooperativas" | "sistema";

export interface AdminNavItem {
  id: AdminSection;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "inicio",
    label: "Início",
    description: "Resumo e alertas",
    icon: LayoutDashboard,
  },
  {
    id: "cobranca",
    label: "Cobrança",
    description: "Mensalidade HB",
    icon: Banknote,
  },
  {
    id: "conta-coop",
    label: "Conta Coop",
    description: "Descontos e repasses",
    icon: Wallet,
  },
  {
    id: "cooperativas",
    label: "Cooperativas",
    description: "Cadastros e engajamento",
    icon: Building2,
  },
  {
    id: "sistema",
    label: "Sistema",
    description: "Nuvem e configurações",
    icon: Settings,
  },
];

interface AdminNavProps {
  active: AdminSection;
  onChange: (section: AdminSection) => void;
  badges?: Partial<Record<AdminSection, number>>;
}

export function AdminNav({ active, onChange, badges }: AdminNavProps) {
  return (
    <nav className="space-y-1" aria-label="Menu administrativo">
      {ADMIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        const badge = badges?.[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "w-full flex items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
              isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Icon size={18} className={cn("shrink-0 mt-0.5", isActive ? "text-emerald-600" : "")} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold">{item.label}</span>
                {badge != null && badge > 0 && (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className={cn("block text-xs mt-0.5", isActive ? "text-slate-500" : "text-slate-400")}>
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function adminSectionTitle(section: AdminSection): string {
  return ADMIN_NAV_ITEMS.find((item) => item.id === section)?.label ?? "Admin";
}

export function adminSectionDescription(section: AdminSection): string {
  switch (section) {
    case "inicio":
      return "Visão consolidada da plataforma com indicadores e pendências.";
    case "cobranca":
      return "Cobrança mensal HB por cooperado cadastrado — registrar, confirmar e bloquear.";
    case "conta-coop":
      return "Operação Conta Coop na plataforma: descontos, split 60/30/10 e repasses à HB.";
    case "cooperativas":
      return "Cooperativas cadastradas, e-mails de acesso e uso do app pelos cooperados.";
    case "sistema":
      return "Saúde da nuvem, armazenamento local e segurança do painel.";
    default:
      return "";
  }
}
