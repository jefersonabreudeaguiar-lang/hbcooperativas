"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { ContadorAccessGuard } from "@/components/contador/ContadorAccessGuard";
import { PageHeader, DataTable } from "@/components/ui/Table";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getSnapshotFechamentoMes,
  listSnapshotsCooperativa,
  parseSnapshotPayload,
  verificarIntegridadeSnapshot,
} from "@/services/fechamentoSnapshotService";
import { listMesesConciliacao } from "@/services/conciliacaoMensalService";
import { formatCurrency, formatDateTime, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

export default function ContadorSnapshotPage() {
  const data = useAppData();
  const { coopId } = usePermissions();
  const [mes, setMes] = useState(getCurrentMesReferencia());

  const meses = useMemo(() => (data ? listMesesConciliacao(data) : [mes]), [data, mes]);
  const snapshots = useMemo(() => {
    if (!data || !coopId) return [];
    return listSnapshotsCooperativa(data, coopId);
  }, [data, coopId]);

  const snapshot = useMemo(() => {
    if (!data || !coopId) return undefined;
    return getSnapshotFechamentoMes(data, coopId, mes);
  }, [data, coopId, mes]);

  const payload = useMemo(() => {
    if (!snapshot) return null;
    try {
      return parseSnapshotPayload(snapshot);
    } catch {
      return null;
    }
  }, [snapshot]);

  if (!data || !coopId) return null;

  const integridadeOk = snapshot ? verificarIntegridadeSnapshot(snapshot) : null;

  return (
    <ContadorAccessGuard>
      <PageHeader
        title="Snapshot imutável"
        subtitle="Registro congelado no fechamento aprovado — consulta e verificação de integridade"
        action={
          <Link href={`/contador/dossie?mes=${mes}`}>
            <Button variant="secondary" size="sm">
              Dossiê ZIP
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-4 mb-6">
        <FormField label="Mês">
          <Select value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {formatMesReferencia(m)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {!snapshot ? (
        <Card>
          <div className="flex items-center gap-3 text-gray-600">
            <Lock size={20} />
            <p className="text-sm">
              Nenhum snapshot para {formatMesReferencia(mes)}. O registro é criado automaticamente quando o responsável
              aprova o fechamento mensal.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              title="Integridade"
              value={integridadeOk ? "OK" : "Alterado"}
              variant={integridadeOk ? "success" : "warning"}
            />
            <StatCard title="Hash" value={snapshot.contentHash} variant="default" />
            <StatCard
              title="Capturado em"
              value={formatDateTime(snapshot.capturedAt).split(" ")[0]}
              variant="gold"
            />
          </div>

          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              {integridadeOk ? (
                <CheckCircle2 className="text-green-700" size={20} />
              ) : (
                <XCircle className="text-red-600" size={20} />
              )}
              <h2 className="font-semibold">Verificação</h2>
            </div>
            <p className="text-sm text-gray-600">
              Capturado por <strong>{snapshot.capturedByName}</strong> em {formatDateTime(snapshot.capturedAt)}.
              {integridadeOk
                ? " O hash confere com o conteúdo armazenado — snapshot íntegro."
                : " O hash não confere — o payload pode ter sido alterado manualmente."}
            </p>
          </Card>

          {payload && (
            <Card title="Totais congelados" className="mb-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Vendas</span>
                  <p className="font-semibold">{formatCurrency(payload.calculo.totalVendas)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Pagamentos</span>
                  <p className="font-semibold">{formatCurrency(payload.calculo.totalPagamentos)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Conciliação OK</span>
                  <p className="font-semibold">{payload.conciliacao.resumo.percentualOk}%</p>
                </div>
                <div>
                  <span className="text-gray-500">Fechamento</span>
                  <p className="font-semibold">
                    <StatusBadge status={payload.fechamento.status === "aprovado" ? "aprovado" : "revisado"} />
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Pagamentos registrados</span>
                  <p className="font-semibold">{payload.pagamentosResumo.length}</p>
                </div>
                <div>
                  <span className="text-gray-500">Lançamentos ficha</span>
                  <p className="font-semibold">{payload.fichaResumo.length}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <Card title="Histórico de snapshots">
        <DataTable
          data={snapshots}
          keyField="id"
          emptyMessage="Nenhum snapshot registrado ainda."
          columns={[
            { key: "mes", label: "Mês", render: (s) => formatMesReferencia(s.mesReferencia) },
            { key: "capturedAt", label: "Capturado", render: (s) => formatDateTime(s.capturedAt) },
            { key: "by", label: "Por", render: (s) => s.capturedByName },
            { key: "hash", label: "Hash", render: (s) => <code className="text-xs">{s.contentHash}</code> },
            {
              key: "ok",
              label: "Integridade",
              render: (s) => (
                <StatusBadge status={verificarIntegridadeSnapshot(s) ? "aprovado" : "bloqueado"} />
              ),
            },
          ]}
        />
      </Card>

      <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
        <ShieldCheck size={16} />
        Snapshots são incluídos automaticamente no dossiê ZIP mensal.
      </div>
    </ContadorAccessGuard>
  );
}
