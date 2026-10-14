"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { buildPwaRescueAutoLoginHref } from "@/lib/pwa/cooperadoPwaRescueUrl";
import { requestAppSyncImmediate } from "@/services/syncRequest";
import { isStaffSessionActiveInStorage } from "@/lib/staff/staffSessionRoleHint";

export default function FichaCorridaSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ficha-corrida-error]", error);
  }, [error]);

  const staff = isStaffSessionActiveInStorage();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-gray-900">Não foi possível abrir Pagar cooperados</h1>
      <p className="text-sm text-gray-600 max-w-sm">
        {staff
          ? "Atualize os dados da cooperativa e tente de novo. Se persistir, use reparar atalho."
          : "Pode ser cache misturado após atualização. Use reparar atalho ou envie o relatório ao suporte."}
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {staff && (
          <Button
            type="button"
            onClick={() => {
              requestAppSyncImmediate();
              reset();
            }}
          >
            Atualizar dados da cooperativa
          </Button>
        )}
        <Button type="button" variant={staff ? "secondary" : "primary"} onClick={() => reset()}>
          Tentar novamente
        </Button>
        <Link href={buildPwaRescueAutoLoginHref()} className="w-full">
          <Button type="button" variant="secondary" className="w-full">
            Reparar atalho do app
          </Button>
        </Link>
        <Link href="/pwa-crash-forensics.html" className="text-sm text-green-800 font-medium underline">
          Abrir forensics (copiar relatório)
        </Link>
      </div>
    </div>
  );
}
