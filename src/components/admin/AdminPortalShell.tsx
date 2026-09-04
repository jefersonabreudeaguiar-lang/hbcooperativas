"use client";

import Link from "next/link";
import { LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/Button";
import { AdminNav, adminSectionDescription, adminSectionTitle, type AdminSection } from "@/components/admin/AdminNav";
import { PLATFORM_NAME } from "@/utils/constants";

interface AdminPortalShellProps {
  children: React.ReactNode;
  subtitle?: string;
  /** Omitir no login — oculta menu lateral e chips mobile */
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  badges?: Partial<Record<AdminSection, number>>;
}

export function AdminPortalShell({
  children,
  subtitle,
  activeSection,
  onSectionChange,
  badges,
}: AdminPortalShellProps) {
  const { user, logout } = useAuth();
  const showNav = activeSection != null && onSectionChange != null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-950 text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AppIcon size="sm" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{PLATFORM_NAME} · Administração</p>
              <p className="text-xs text-slate-400 truncate">{subtitle ?? user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <Link href="/dashboard">
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
                >
                  <LayoutDashboard size={16} /> App
                </Button>
              </Link>
            )}
            {user && (
              <Button
                variant="secondary"
                size="sm"
                onClick={logout}
                className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
              >
                <LogOut size={16} /> Sair
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className={showNav ? "flex flex-col lg:flex-row gap-6" : ""}>
          {showNav && (
            <aside className="lg:w-64 shrink-0">
              <div className="rounded-2xl bg-slate-900 p-3 lg:sticky lg:top-24">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Menu</p>
                <AdminNav active={activeSection} onChange={onSectionChange} badges={badges} />
              </div>
              <div className="mt-3 lg:hidden overflow-x-auto">
                <div className="flex gap-2 pb-1 min-w-max">
                  {(["inicio", "cobranca", "conta-coop", "cooperativas", "sistema"] as AdminSection[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSectionChange(id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                        activeSection === id
                          ? "bg-slate-900 text-white"
                          : "bg-white text-gray-700 border border-gray-200"
                      }`}
                    >
                      {adminSectionTitle(id)}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}

          <main className={showNav ? "flex-1 min-w-0" : ""}>
            {showNav && (
              <p className="mb-4 text-sm text-slate-600 hidden lg:block">{adminSectionDescription(activeSection)}</p>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
