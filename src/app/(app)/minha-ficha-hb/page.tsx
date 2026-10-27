"use client";

import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { PageHeader } from "@/components/ui/Table";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { normalizeCnpj, getUserCooperativaId } from "@/utils/cooperativa";
import { HbCreditFichaPlanoPanel } from "@/components/hb-credit/HbCreditFichaPlanoPanel";
function MinhaFichaHbContent() {
  const { user, isCooperado } = usePermissions();
  const data = useAppData();

  const cnpj = useMemo(() => {
    if (!user || !data) return "";
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    return normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
  }, [user, data]);

  const cooperadoId = user?.cooperadoId ?? "";

  if (!user || !data) return <PageSkeleton />;

  if (!isCooperado || !cooperadoId || cnpj.length !== 14) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        Esta ficha é exclusiva para cooperados com conta HB ativa.
      </div>
    );
  }

  const nome = data.cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto ?? user.name;

  return (
    <div>
      <PageHeader title="Minha ficha HB" subtitle="Resumo atualizado pelo responsável — sem peso, só valores e mensalidades" />
      <HbCreditFichaPlanoPanel cnpj={cnpj} cooperadoId={cooperadoId} cooperadoNome={nome} mode="readonly" />
    </div>
  );
}

export default function MinhaFichaHbPage() {
  return <MinhaFichaHbContent />;
}
