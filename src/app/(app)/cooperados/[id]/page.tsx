"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { CooperadoFichaPanel } from "@/components/cooperado/CooperadoFichaPanel";

export default function CooperadoFichaPage() {
  const params = useParams();
  const router = useRouter();
  const data = useAppData();
  const { user, isCooperado } = usePermissions();
  const id = typeof params.id === "string" ? params.id : params.id?.[0];

  const cooperado = useMemo(() => {
    if (!data || !id) return undefined;
    return data.cooperados.find((c) => c.id === id);
  }, [data, id]);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const acessoOk = cooperado && (!coopId || cooperado.cooperativaId === coopId) && !isCooperado;

  if (!data) return null;

  if (!cooperado || !acessoOk) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Cooperado não encontrado.</p>
        <Button variant="secondary" onClick={() => router.push("/cooperados")}>Voltar</Button>
      </div>
    );
  }

  return (
    <div>
      <Link href="/cooperados" className="inline-flex items-center gap-1 text-sm text-green-700 font-medium mb-4 hover:text-green-800">
        <ArrowLeft size={16} /> Todos os cooperados
      </Link>
      <PageHeader
        title={cooperado.nomeCompleto}
        subtitle="Ficha pessoal — entregas, lançamentos, mensalidades e pagamentos"
      />
      <CooperadoFichaPanel cooperado={cooperado} />
    </div>
  );
}
