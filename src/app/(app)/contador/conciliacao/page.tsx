"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { ContadorAccessGuard } from "@/components/contador/ContadorAccessGuard";
import { PageHeader, DataTable } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ModalEmitirRelatorio } from "@/components/relatorios/ModalEmitirRelatorio";
import {
  calcularConciliacaoMensal,
  listMesesConciliacao,
} from "@/services/conciliacaoMensalService";
import {
  baixarDocumento,
  gerarRelatorioConciliacaoHtml,
  imprimirDocumentoHtml,
  nomeArquivoRelatorio,
} from "@/utils/relatorioHtml";
import type { EmissorRelatorio } from "@/types";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperativaById } from "@/utils/cooperativa";

export default function ContadorConciliacaoPage() {
  const data = useAppData();
  const { user, coopId, check } = usePermissions();
  const searchParams = useSearchParams();
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [modalEmissao, setModalEmissao] = useState<"pdf" | "print" | null>(null);

  useEffect(() => {
    const q = searchParams.get("mes");
    if (q) setMes(q);
  }, [searchParams]);

  const meses = useMemo(() => (data ? listMesesConciliacao(data) : [mes]), [data, mes]);
  const conciliacao = useMemo(
    () => (data ? calcularConciliacaoMensal(data, mes, coopId ?? undefined) : null),
    [data, mes, coopId]
  );

  if (!data || !user) return null;

  const coop = coopId ? getCooperativaById(data, coopId) : data.cooperativas[0];

  const emitir = (emissor: EmissorRelatorio) => {
    if (!conciliacao) return;
    const html = gerarRelatorioConciliacaoHtml(data, conciliacao, coop, emissor);
    if (modalEmissao === "print") imprimirDocumentoHtml(html);
    else void baixarDocumento(html, nomeArquivoRelatorio("conciliacao-mensal", mes));
    setModalEmissao(null);
  };

  return (
    <ContadorAccessGuard>
      <PageHeader
        title="Conciliação mensal"
        subtitle={`${coop?.nome ?? "Cooperativa"} · ${formatMesReferencia(mes)}`}
        action={
          <div className="flex flex-wrap gap-2 items-end">
            <FormField label="Mês">
              <Select value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {formatMesReferencia(m)}
                  </option>
                ))}
              </Select>
            </FormField>
            {check("contador", "export") && (
              <>
                <Button variant="secondary" onClick={() => setModalEmissao("print")}>
                  <Printer size={16} /> Imprimir
                </Button>
                <Button onClick={() => setModalEmissao("pdf")}>
                  <Download size={16} /> PDF
                </Button>
              </>
            )}
          </div>
        }
      />

      {conciliacao && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <StatCard title="Linhas OK" value={String(conciliacao.resumo.conciliadas)} variant="success" />
            <StatCard title="Divergências" value={String(conciliacao.resumo.divergencias)} variant="warning" />
            <StatCard title="Sem movimento" value={String(conciliacao.resumo.ausentes)} variant="default" />
            <StatCard title="Índice" value={`${conciliacao.resumo.percentualOk}%`} variant="gold" />
          </div>

          <Card className="mb-6">
            <h2 className="font-semibold mb-4">Matriz de conciliação</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="p-3">Verificação</th>
                    <th className="p-3 text-right">Fonte A</th>
                    <th className="p-3 text-right">Fonte B</th>
                    <th className="p-3 text-right">Diferença</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliacao.linhas.map((linha) => (
                    <tr key={linha.id} className="border-b border-gray-100">
                      <td className="p-3">
                        <p className="font-medium">{linha.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{linha.descricao}</p>
                        {linha.detalhe && <p className="text-xs text-amber-700 mt-1">{linha.detalhe}</p>}
                      </td>
                      <td className="p-3 text-right">
                        <p className="text-xs text-gray-500">{linha.labelA}</p>
                        <p className="font-medium">{formatCurrency(linha.valorA)}</p>
                      </td>
                      <td className="p-3 text-right">
                        <p className="text-xs text-gray-500">{linha.labelB}</p>
                        <p className="font-medium">{formatCurrency(linha.valorB)}</p>
                      </td>
                      <td className="p-3 text-right font-medium">{formatCurrency(linha.diferenca)}</td>
                      <td className="p-3">
                        <StatusBadge
                          status={
                            linha.status === "ok"
                              ? "aprovado"
                              : linha.status === "divergencia"
                                ? "bloqueado"
                                : "pendente"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {conciliacao.alertas.length > 0 && (
            <Card>
              <h2 className="font-semibold mb-4">Alertas de auditoria</h2>
              <DataTable
                columns={[
                  { key: "severidade", label: "Nível" },
                  { key: "titulo", label: "Alerta" },
                  { key: "descricao", label: "Detalhe" },
                ]}
                data={conciliacao.alertas.map((a) => ({
                  ...a,
                  severidade:
                    a.severidade === "critico" ? "Crítico" : a.severidade === "aviso" ? "Aviso" : "Info",
                }))}
                keyField="id"
              />
            </Card>
          )}
        </>
      )}

      {modalEmissao && (
        <ModalEmitirRelatorio
          open={Boolean(modalEmissao)}
          titulo="Emitir relatório de conciliação"
          user={user}
          onClose={() => setModalEmissao(null)}
          onConfirm={emitir}
        />
      )}
    </ContadorAccessGuard>
  );
}
