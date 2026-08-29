"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { canAccessCentralContador, isReadOnlyAuditorRole } from "@/permissions";

export function ContadorAccessGuard({ children }: { children: React.ReactNode }) {
  const { user, check } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (!canAccessCentralContador(user.role) && !check("contador", "view")) {
      router.replace("/dashboard");
    }
  }, [user, router, check]);

  if (!user) return null;
  if (!canAccessCentralContador(user.role) && !check("contador", "view")) return null;

  return (
    <>
      {isReadOnlyAuditorRole(user.role) && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Modo auditoria — somente leitura. Você pode consultar, exportar e emitir relatórios, mas não alterar lançamentos.
        </div>
      )}
      {children}
    </>
  );
}
