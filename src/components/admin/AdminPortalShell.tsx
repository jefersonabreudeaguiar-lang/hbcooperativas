"use client";

import Link from "next/link";
import { LogOut, Shield, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { AppIcon } from "@/components/ui/AppIcon";
import { Button } from "@/components/ui/Button";
import { PLATFORM_NAME } from "@/utils/constants";

interface AdminPortalShellProps {
  children: React.ReactNode;
  subtitle?: string;
}

export function AdminPortalShell({ children, subtitle }: AdminPortalShellProps) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AppIcon size="sm" />
            <div className="min-w-0">
              <p className="font-semibold truncate flex items-center gap-2">
                <Shield size={16} className="text-green-400 shrink-0" />
                {PLATFORM_NAME} · Admin
              </p>
              <p className="text-xs text-slate-400 truncate">
                {subtitle ?? "Painel do criador da plataforma"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[200px]">
                {user.email}
              </span>
            )}
            <Link href="/dashboard">
              <Button variant="secondary" size="sm" className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
                <LayoutDashboard size={16} /> App
              </Button>
            </Link>
            {user && (
              <Button variant="secondary" size="sm" onClick={logout} className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
                <LogOut size={16} /> Sair
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
