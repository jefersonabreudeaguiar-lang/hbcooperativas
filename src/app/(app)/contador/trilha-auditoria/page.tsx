"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Cloud, HardDrive } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { ContadorAccessGuard } from "@/components/contador/ContadorAccessGuard";
import { PageHeader, DataTable } from "@/components/ui/Table";
import { Select, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { fetchCloudAuditLog, syncLocalAuditToCloud } from "@/services/cooperativeAuditCloudService";
import { listMesesConciliacao } from "@/services/conciliacaoMensalService";
import { formatDateTime, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperativaById, normalizeCnpj } from "@/utils/cooperativa";

type AuditRow = {
  id: string;
  origem: string;
  occurredAt: string;
  actorName: string;
  action: string;
  entityType: string;
  summary: string;
};

export default function ContadorTrilhaAuditoriaPage() {
  const data = useAppData();
  const { user, coopId } = usePermissions();
  const searchParams = useSearchParams();
  const [mes, setMes] = useState<string>("");
  const [cloudEntries, setCloudEntries] = useState<AuditRow[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);

  useEffect(() => {
    const q = searchParams.get("mes");
    if (q) setMes(q);
  }, [searchParams]);

  const meses = useMemo(() => (data ? listMesesConciliacao(data) : []), [data]);
  const coop = data && coopId ? getCooperativaById(data, coopId) : data?.cooperativas[0];
  const cnpj = coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";

  useEffect(() => {
    if (!data || !cnpj) return;
    void syncLocalAuditToCloud(data, cnpj);
  }, [data, cnpj]);

  useEffect(() => {
    if (!cnpj) return;
    setLoadingCloud(true);
    void fetchCloudAuditLog(cnpj, { mesReferencia: mes || undefined, limit: 150 })
      .then((entries) => {
        setCloudEntries(
          entries.map((e) => ({
            id: e.id,
            origem: "Nuvem",
            occurredAt: e.occurredAt,
            actorName: e.actorName,
            action: e.action,
            entityType: e.entityType,
            summary: e.summary,
          }))
        );
      })
      .finally(() => setLoadingCloud(false));
  }, [cnpj, mes]);

  const localRows: AuditRow[] = useMemo(() => {
    if (!data) return [];
    return data.auditLog
      .filter((e) => !mes || e.changes?.includes(mes) || e.timestamp.startsWith(mes))
      .slice(0, 100)
      .map((e) => ({
        id: e.id,
        origem: "Local",
        occurredAt: e.timestamp,
        actorName: e.userName,
        action: e.action,
        entityType: e.entityType,
        summary: e.changes ?? `${e.action} em ${e.entityType}`,
      }));
  }, [data, mes]);

  const merged = useMemo(() => {
    const map = new Map<string, AuditRow>();
    for (const row of [...cloudEntries, ...localRows]) {
      if (!map.has(row.id)) map.set(row.id, row);
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
  }, [cloudEntries, localRows]);

  if (!data || !user) return null;

  return (
    <ContadorAccessGuard>
      <PageHeader
        title="Trilha de auditoria"
        subtitle={coop?.nome ?? "Cooperativa"}
        action={
          <FormField label="Filtrar mês">
            <Select value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="">Todos os meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {formatMesReferencia(m)}
                </option>
              ))}
            </Select>
          </FormField>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-2 text-green-800 font-medium">
            <Cloud size={18} /> Nuvem ({cloudEntries.length})
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Eventos persistidos no Supabase — imutáveis e compartilhados entre dispositivos.
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-gray-800 font-medium">
            <HardDrive size={18} /> Local ({localRows.length})
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Registros do aparelho — sincronizados automaticamente para a nuvem quando possível.
          </p>
        </Card>
      </div>

      <Card>
        {loadingCloud && <p className="text-sm text-gray-500 mb-3">Carregando trilha na nuvem…</p>}
        <DataTable
          columns={[
            {
              key: "occurredAt",
              label: "Data",
              render: (item) => formatDateTime(item.occurredAt),
            },
            { key: "origem", label: "Origem" },
            { key: "actorName", label: "Usuário" },
            { key: "action", label: "Ação" },
            { key: "entityType", label: "Entidade" },
            { key: "summary", label: "Resumo" },
          ]}
          data={merged}
          keyField="id"
          emptyMessage="Nenhum evento de auditoria encontrado."
        />
      </Card>
    </ContadorAccessGuard>
  );
}
