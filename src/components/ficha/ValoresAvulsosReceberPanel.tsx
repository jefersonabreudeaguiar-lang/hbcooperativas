"use client";

import Link from "next/link";
import { Plus, Banknote, History } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField, Textarea } from "@/components/ui/Form";
import {
  valoresAvulsosDaCooperativa,
  valoresAvulsosDoCooperado,
  valoresAvulsosHistoricoCooperado,
  valoresAvulsosPendentesMes,
  totalValoresAvulsosPendentes,
} from "@/services/valoresAvulsosReceberService";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";

interface ValoresAvulsosReceberPanelProps {
  cooperadoId: string;
  cooperativaId?: string;
  mesReferencia?: string;
  modo: "cooperado" | "responsavel";
  onLancar?: (params: { motivo: string; valor: number; dataLancamento: string }) => void;
  onRemover?: (id: string) => void;
  lancamentoForm?: {
    motivo: string;
    valor: string;
    data: string;
    onMotivo: (v: string) => void;
    onValor: (v: string) => void;
    onData: (v: string) => void;
  };
}

export function ValoresAvulsosReceberPanel({
  cooperadoId,
  cooperativaId,
  mesReferencia,
  modo,
  onLancar,
  onRemover,
  lancamentoForm,
}: ValoresAvulsosReceberPanelProps) {
  const data = useAppData();
  if (!data) return null;

  const pendentes = mesReferencia
    ? valoresAvulsosPendentesMes(data, cooperadoId, mesReferencia, cooperativaId)
    : valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter((v) => v.status === "pendente");

  const historico = valoresAvulsosHistoricoCooperado(data, cooperadoId, cooperativaId, 15);
  const totalPendente = mesReferencia
    ? totalValoresAvulsosPendentes(data, cooperadoId, mesReferencia, cooperativaId)
    : totalValoresAvulsosPendentes(data, cooperadoId, undefined, cooperativaId);

  const gerenciaveis =
    modo === "responsavel" && cooperativaId && mesReferencia
      ? valoresAvulsosDaCooperativa(data, cooperativaId, cooperadoId, mesReferencia)
      : [];

  if (modo === "cooperado" && pendentes.length === 0 && historico.length === 0) return null;

  return (
    <Card
      title={modo === "cooperado" ? "Valores avulsos a receber" : "Valores avulsos do cooperado"}
      className="mb-6"
    >
      {totalPendente > 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-4">
          <div className="flex items-start gap-3">
            <Banknote size={22} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-emerald-900">
                {modo === "cooperado" ? "Total avulso pendente" : "Pendente neste mês"}
              </p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">{formatCurrency(totalPendente)}</p>
              {mesReferencia && (
                <p className="text-sm text-emerald-700 mt-1">{formatMesReferencia(mesReferencia)}</p>
              )}
            </div>
            {modo === "cooperado" && (
              <Link href="/ficha-corrida" className="shrink-0">
                <Button size="sm" variant="secondary">
                  Ver detalhes
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {pendentes.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-800 mb-2">Pendentes</p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            {pendentes.map((v) => (
              <li key={v.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white">
                <div>
                  <p className="font-medium text-gray-900">{v.motivo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatMesReferencia(v.mesReferencia)} · lançado em {formatDate(v.dataLancamento)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-emerald-700">{formatCurrency(v.valor)}</span>
                  {modo === "responsavel" && onRemover && (
                    <Button size="sm" variant="secondary" onClick={() => onRemover(v.id)}>
                      Excluir
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modo === "responsavel" && lancamentoForm && onLancar && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 mb-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
            <Plus size={16} /> Lançar valor avulso a receber
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Valor (R$)" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={lancamentoForm.valor}
                onChange={(e) => lancamentoForm.onValor(e.target.value)}
              />
            </FormField>
            <FormField label="Data">
              <Input
                type="date"
                value={lancamentoForm.data}
                onChange={(e) => lancamentoForm.onData(e.target.value)}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Motivo / descrição" required>
                <Textarea
                  value={lancamentoForm.motivo}
                  onChange={(e) => lancamentoForm.onMotivo(e.target.value)}
                  placeholder="Ex.: diferença de entrega, bonificação, ajuste acordado"
                  rows={2}
                />
              </FormField>
            </div>
          </div>
          <Button
            onClick={() => {
              const valor = parseFloat(lancamentoForm.valor.replace(",", ".")) || 0;
              if (valor <= 0 || !lancamentoForm.motivo.trim()) return;
              onLancar({
                motivo: lancamentoForm.motivo.trim(),
                valor,
                dataLancamento: lancamentoForm.data,
              });
            }}
          >
            Adicionar valor avulso
          </Button>
        </div>
      )}

      {(historico.length > 0 || (modo === "responsavel" && gerenciaveis.some((v) => v.status === "pago"))) && (
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <History size={16} /> Histórico
          </p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
            {(modo === "cooperado" ? historico : gerenciaveis.filter((v) => v.status === "pago")).map((v) => (
              <li key={v.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-gray-50/80">
                <div>
                  <p className="font-medium text-gray-800">{v.motivo}</p>
                  <p className="text-xs text-gray-500">
                    {formatMesReferencia(v.mesReferencia)}
                    {v.dataPagamento ? ` · pago em ${formatDate(v.dataPagamento)}` : ""}
                  </p>
                </div>
                <span className="font-semibold text-gray-700 shrink-0">{formatCurrency(v.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Bloco compacto fixo na tela inicial do cooperado. */
export function ValoresAvulsosDashboardCard({
  cooperadoId,
  cooperativaId,
}: {
  cooperadoId: string;
  cooperativaId?: string;
}) {
  const data = useAppData();
  if (!data) return null;

  const pendentes = valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter(
    (v) => v.status === "pendente"
  );
  const historico = valoresAvulsosHistoricoCooperado(data, cooperadoId, cooperativaId, 8);
  const totalPendente = totalValoresAvulsosPendentes(data, cooperadoId, undefined, cooperativaId);

  if (pendentes.length === 0 && historico.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote size={20} className="text-emerald-700" />
          <p className="font-semibold text-gray-900">Valores avulsos a receber</p>
        </div>
        {totalPendente > 0 && (
          <span className="text-sm font-bold text-emerald-700">{formatCurrency(totalPendente)}</span>
        )}
      </div>

      {pendentes.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {pendentes.slice(0, 5).map((v) => (
            <li key={v.id} className="px-5 py-3 flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{v.motivo}</p>
                <p className="text-xs text-gray-500">{formatMesReferencia(v.mesReferencia)}</p>
              </div>
              <span className="font-semibold text-emerald-700 shrink-0">{formatCurrency(v.valor)}</span>
            </li>
          ))}
        </ul>
      )}

      {historico.length > 0 && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <History size={12} /> Histórico
          </p>
          <ul className="space-y-2">
            {historico.slice(0, 5).map((v) => (
              <li key={v.id} className="flex justify-between gap-2 text-xs text-gray-600">
                <span className="truncate">{v.motivo}</span>
                <span className="shrink-0">{formatCurrency(v.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-5 py-3 border-t border-gray-100">
        <Link href="/ficha-corrida" className="text-sm font-medium text-green-700 hover:underline">
          Ver em Quanto vou receber
        </Link>
      </div>
    </div>
  );
}
