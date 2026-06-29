"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { isDiretoriaRole } from "@/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { isAppCreator } from "@/lib/security/appCreator";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { AdminAreaGate } from "@/components/admin/AdminAreaGate";
import { AdminDashboardPanel } from "@/components/admin/AdminDashboardPanel";
import { isAdminAreaUnlocked } from "@/services/adminAreaService";

export default function AdminAreaPage() {
  const { user } = useAuth();
  const { check } = usePermissions();
  const data = useAppData();
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  useEffect(() => {
    if (!user) return;
    if (!isAppCreator(user)) {
      router.replace("/dashboard");
      return;
    }
    if (!isDiretoriaRole(user.role) || !check("cooperativas", "edit")) {
      router.replace("/dashboard");
      return;
    }
    if (coopId && isAdminAreaUnlocked(coopId)) {
      setUnlocked(true);
    }
    setChecked(true);
  }, [user, coopId, router, check]);

  if (!user || !data || !coopId || !checked) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-gray-500">Carregando área administrativa…</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <AdminAreaGate
        cooperativaId={coopId}
        user={user}
        onUnlocked={() => setUnlocked(true)}
      />
    );
  }

  return (
    <AdminDashboardPanel
      cooperativaId={coopId}
      user={user}
      onLocked={() => setUnlocked(false)}
    />
  );
}
