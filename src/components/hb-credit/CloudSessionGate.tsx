"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  ensureCloudSessionReady,
  getAccessToken,
  getLastCloudSyncError,
  userToCloudProfile,
} from "@/lib/security/clientSession";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";

export function CloudSessionGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const sync = useCallback(async () => {
    if (!user) return false;
    setError("");

    try {
      const schemaRes = await fetch("/api/auth/schema-status", { cache: "no-store" });
      const schemaJson = (await schemaRes.json().catch(() => ({}))) as {
        appUsersTableOk?: boolean;
        message?: string;
        code?: string;
      };
      if (schemaJson.appUsersTableOk === false) {
        setReady(false);
        setError(
          schemaJson.message ??
            "Conta na nuvem não configurada (tabela app_users). Fale com o suporte HB Cooperativas."
        );
        return false;
      }
    } catch {
      /* segue tentando sync */
    }

    const profile = userToCloudProfile(user);
    const ok = await ensureCloudSessionReady(profile);
    if (ok && getAccessToken()) {
      setReady(true);
      return true;
    }
    setReady(false);
    const detail = getLastCloudSyncError();
    setError(
      detail
        ? detail
        : "Não foi possível conectar à nuvem para a Conta Coop. Desconecte, entre de novo e aguarde alguns segundos."
    );
    return false;
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    void sync();
  }, [authLoading, user, router, sync]);

  const retry = async () => {
    setRetrying(true);
    await sync();
    setRetrying(false);
  };

  if (authLoading || (!ready && !error)) {
    return <PageSkeleton />;
  }

  if (!ready) {
    return (
      <div className="max-w-lg space-y-4">
        <AlertBanner variant="error" title="Conexão com a nuvem">
          {error}
        </AlertBanner>
        <div className="flex flex-wrap gap-2">
          <Button onClick={retry} disabled={retrying}>
            {retrying ? "Conectando..." : "Tentar novamente"}
          </Button>
          <Button variant="secondary" onClick={() => logout()}>
            Desconectar e entrar de novo
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
