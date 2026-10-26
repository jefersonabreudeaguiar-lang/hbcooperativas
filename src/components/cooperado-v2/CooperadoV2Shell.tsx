"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Tag, Receipt, RefreshCw } from "lucide-react";
import { COOPERADO_V2_TABS } from "@/lib/cooperado-v2/cooperadoV2Pilot";

const TAB_ICONS: Record<string, React.ReactNode> = {
  inicio: <LayoutDashboard size={20} />,
  entregas: <ClipboardList size={20} />,
  precos: <Tag size={20} />,
  financeiro: <Receipt size={20} />,
};

function tabKey(href: string): string {
  const parts = href.split("/");
  return parts[parts.length - 1] ?? "inicio";
}

type Props = {
  children: React.ReactNode;
  onAtualizar?: () => void;
  atualizando?: boolean;
};

export function CooperadoV2Shell({ children, onAtualizar, atualizando }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col pb-20">
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-green-900 text-white sticky top-0 z-40">
        <span className="font-semibold text-sm tracking-tight">HB Cooperativas</span>
        {onAtualizar ? (
          <button
            type="button"
            onClick={onAtualizar}
            disabled={atualizando}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-800 hover:bg-green-700 disabled:opacity-60"
            aria-busy={atualizando}
          >
            <RefreshCw size={16} className={atualizando ? "animate-spin" : undefined} />
            {atualizando ? "Atualizando…" : "Atualizar"}
          </button>
        ) : null}
      </header>

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex bg-white border-t-2 border-green-200 safe-area-pb shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
        {COOPERADO_V2_TABS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const key = tabKey(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
                active ? "text-green-800" : "text-gray-500"
              }`}
            >
              <span className={active ? "text-green-700" : "text-gray-400"}>{TAB_ICONS[key]}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
