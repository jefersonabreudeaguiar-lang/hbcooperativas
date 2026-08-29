"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Scale,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { ContadorAccessGuard } from "@/components/contador/ContadorAccessGuard";
import { PageHeader, DataTable } from "@/components/ui/Table";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  calcularConciliacaoMensal,
  listMesesConciliacao,
} from "@/services/conciliacaoMensalService";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperativaById } from "@/utils/cooperativa";

export default function ContadorDashboardPage() {
  const data = useAppData();
  const { user, coopId } = usePermissions();
  const [mes, setMes] = useState(getCurrentMesReferencia());

  const meses = useMemo(() => (data ? listMesesConciliacao(data) : [mes]), [data, mes]);
  const conciliacao = useMemo(
    () => (data ? calcularConciliacaoMensal(data, mes, coopId ?? undefined) : null),
    [data, mes, coopId]
  );

  if (!data || !user) return null;

  const coop = coopId ? getCooperativaById(data, coopId) : data.cooperativas[0];
  const alertasCriticos = conciliacao?.alertas.filter((a) => a.severidade === "critico").length ?? 0;

  return (
    <ContadorAccessGuard>
      <PageHeader
        title="Central do Contador"
        subtitle={`${coop?.nome ?? "Cooperativa"} · ${formatMesReferencia(mes)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <FormField label="">
              <Select value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {formatMesReferencia(m)}
                  </option>
                ))}
              </Select>
            </FormField>
            <Link href={`/contador/conciliacao?mes=${mes}`}>
              <Button variant="secondary">
                <Scale size={16} /> Conciliação
              </Button>
            </Link>
          </div>
        }
      />

      {conciliacao && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Conciliação OK"
              value={`${conciliacao.resumo.percentualOk}%`}
              variant={conciliacao.resumo.divergencias === 0 ? "success" : "warning"}
            />
            <StatCard
              title="Entregas conferidas"
              value={String(conciliacao.kpis.totalEntregasConferidas)}
              variant="default"
            />
            <StatCard
              title="A pagar cooperados"
              value={formatCurrency(conciliacao.kpis.totalAPagarCooperados)}
              variant="gold"
            />
            <StatCard
              title="Pago confirmado"
              value={formatCurrency(conciliacao.kpis.totalPagoCooperados)}
              variant="success"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="text-green-700" size={20} />
                <h2 className="font-semibold text-gray-900">Matriz de conciliação</h2>
              </div>
              <div className="space-y-2">
                {conciliacao.linhas.slice(0, 5).map((linha) => (
                  <div
                    key={linha.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-800">{linha.label}</span>
                    <StatusBadge
                      status={
                        linha.status === "ok"
                          ? "aprovado"
                          : linha.status === "divergencia"
                            ? "bloqueado"
                            : "pendente"
                      }
                    />
                  </div>
                ))}
              </div>
              <Link href={`/contador/conciliacao?mes=${mes}`} className="inline-block mt-4 text-sm text-green-700 font-medium">
                Ver matriz completa →
              </Link>
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="text-amber-600" size={20} />
                <h2 className="font-semibold text-gray-900">Alertas ({conciliacao.alertas.length})</h2>
              </div>
              {conciliacao.alertas.length === 0 ? (
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Nenhum alerta para este mês.
                </p>
              ) : (
                <ul className="space-y-3 max-h-64 overflow-y-auto">
                  {conciliacao.alertas.slice(0, 6).map((a) => (
                    <li key={a.id} className="text-sm border-l-2 border-amber-400 pl-3">
                      <p className="font-medium text-gray-900">{a.titulo}</p>
                      <p className="text-gray-600 mt-0.5">{a.descricao}</p>
                    </li>
                  ))}
                </ul>
              )}
              {alertasCriticos > 0 && (
                <p className="mt-3 text-xs text-red-700 font-medium">{alertasCriticos} alerta(s) crítico(s)</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href={`/contador/conciliacao?mes=${mes}`}>
              <Card className="hover:border-green-300 transition-colors cursor-pointer h-full">
                <Scale className="text-green-700 mb-2" size={24} />
                <h3 className="font-semibold">Conciliação mensal</h3>
                <p className="text-sm text-gray-600 mt-1">Compare entregas, ficha, pagamentos e caixa.</p>
              </Card>
            </Link>
            <Link href={`/contador/trilha-auditoria?mes=${mes}`}>
              <Card className="hover:border-green-300 transition-colors cursor-pointer h-full">
                <ShieldCheck className="text-green-700 mb-2" size={24} />
                <h3 className="font-semibold">Trilha de auditoria</h3>
                <p className="text-sm text-gray-600 mt-1">Histórico de ações na nuvem e local.</p>
              </Card>
            </Link>
            <Link href="/contador/parecer">
              <Card className="hover:border-green-300 transition-colors cursor-pointer h-full">
                <FileText className="text-green-700 mb-2" size={24} />
                <h3 className="font-semibold">Parecer contábil (R9)</h3>
                <p className="text-sm text-gray-600 mt-1">Registrar opinião profissional assinada do mês.</p>
              </Card>
            </Link>
          </div>

          <Card className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={18} className="text-gray-600" />
              <h3 className="font-semibold">Indicadores rápidos</h3>
            </div>
            <DataTable
              columns={[
                { key: "item", label: "Indicador" },
                { key: "valor", label: "Valor" },
              ]}
              data={[
                { item: "Pagamentos aguardando assinatura", valor: conciliacao.kpis.pagamentosSemAssinatura },
                { item: "Notas conferidas sem ficha", valor: conciliacao.kpis.notasSemFicha },
                { item: "Mensalidades em aberto", valor: conciliacao.kpis.mensalidadesAbertas },
                {
                  item: "Status fechamento",
                  valor: conciliacao.kpis.fechamentoStatus ?? "Não iniciado",
                },
              ]}
              keyField="item"
            />
          </Card>
        </>
      )}
    </ContadorAccessGuard>
  );
}
