"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { isAppCreator } from "@/lib/security/appCreator";
import { resolveAdminCooperativaId } from "@/utils/cooperativa";
import { AdminAreaGate } from "@/components/admin/AdminAreaGate";
import { AdminDashboardPanel } from "@/components/admin/AdminDashboardPanel";
import { isAdminAreaUnlocked } from "@/services/adminAreaService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AdminAreaPage() {
  const { user, loading: authLoading } = useAuth();
  const data = useAppData();
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  const coopId = user && data ? resolveAdminCooperativaId(user, data) : undefined;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isAppCreator(user)) {
      router.replace("/dashboard");
      return;
    }
    if (coopId && isAdminAreaUnlocked(coopId)) {
      setUnlocked(true);
    }
    setChecked(true);
  }, [user, authLoading, coopId, router]);

  if (authLoading || !user || !data || !checked) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-gray-500">Carregando área administrativa…</p>
      </div>
    );
  }

  if (!coopId) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Card title="Área administrativa">
          <p className="text-sm text-gray-600 mb-4">
            Sua conta de criador está reconhecida, mas ainda não há cooperativa vinculada neste
            dispositivo. Cadastre uma cooperativa ou faça login com a conta do responsável principal.
          </p>
          <Link href="/cadastro">
            <Button>Cadastrar cooperativa</Button>
          </Link>
        </Card>
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
