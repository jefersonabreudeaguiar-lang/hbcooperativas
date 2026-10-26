"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoV2PilotUser } from "@/lib/cooperado-v2/cooperadoV2Pilot";
import Link from "next/link";

export function CooperadoV2LayoutClient({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=%2Fcooperado-v2%2Finicio");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isCooperadoV2PilotUser(user)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 bg-gray-50 text-center">
        <p className="text-lg font-medium text-gray-900">Cooperado v2 — homologação restrita</p>
        <p className="text-gray-600 text-sm max-w-md">
          Esta versão está liberada apenas para o piloto Orlando. Use o app oficial enquanto isso.
        </p>
        <Link href="/dashboard" className="text-green-800 font-medium underline">
          Ir para o início oficial
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
