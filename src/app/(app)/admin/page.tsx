"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, AlertTriangle } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { isAppCreator } from "@/lib/security/appCreator";
import { resolveAdminCooperativaId } from "@/utils/cooperativa";
import { AdminDashboardPanel } from "@/components/admin/AdminDashboardPanel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AdminAreaPage() {
  const { user, loading: authLoading } = useAuth();
  const data = useAppData();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const coopId = user && data ? resolveAdminCooperativaId(user, data) : undefined;
  const creator = user ? isAppCreator(user) : false;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }
    setReady(true);
  }, [user, authLoading, router]);

  if (authLoading || !ready || !user || !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-gray-500">Carregando área administrativa…</p>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Card title="Acesso restrito">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
            <div>
              <p className="text-sm text-gray-700">
                A área <strong>/admin</strong> é exclusiva do criador da plataforma.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Conta atual: <strong>{user.email}</strong>
              </p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button variant="secondary">Voltar ao início</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!coopId) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <Card title="Área administrativa">
          <p className="text-sm text-gray-600 mb-4">
            Sua conta de criador foi reconhecida, mas ainda não há cooperativa neste aparelho.
            Cadastre a cooperativa ou entre com a conta vinculada ao CNPJ.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/cadastro">
              <Button>Cadastrar cooperativa</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">Ir ao início</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
        <Shield size={18} className="shrink-0" />
        <span>
          Painel do criador · <strong>{user.email}</strong>
        </span>
      </div>
      <AdminDashboardPanel cooperativaId={coopId} user={user} onLocked={() => {}} />
    </div>
  );
}
