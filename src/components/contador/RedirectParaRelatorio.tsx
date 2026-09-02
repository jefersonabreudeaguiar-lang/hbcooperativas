"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { hrefRelatorio } from "@/utils/relatorioRoutes";

interface RedirectParaRelatorioProps {
  tipo: string;
  repassarMes?: boolean;
}

/** Redireciona rotas legadas do contador para /relatorios com query params. */
export function RedirectParaRelatorio({ tipo, repassarMes = true }: RedirectParaRelatorioProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const mes = repassarMes ? searchParams.get("mes") ?? undefined : undefined;
    router.replace(hrefRelatorio(tipo, mes ? { mes } : undefined));
  }, [router, searchParams, tipo, repassarMes]);

  return <PageSkeleton />;
}
