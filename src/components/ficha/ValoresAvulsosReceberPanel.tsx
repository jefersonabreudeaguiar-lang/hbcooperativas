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
  /** Cooperado: filtra histórico pago ao mês exibido (ex.: aba de mês quitado). */
  filtrarHistoricoPorMes?: boolean;
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
  filtrarHistoricoPorMes = false,
  onLancar,
  onRemover,
  lancamentoForm,
}: ValoresAvulsosReceberPanelProps) {
  const data = useAppData();
  if (!data) return null;

  const pendentes = mesReferencia
    ? valoresAvulsosPendentesMes(data, cooperadoId, mesReferencia, cooperativaId)
    : valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter((v) => v.status === "pendente");

  const historicoMes = filtrarHistoricoPorMes && mesReferencia ? mesReferencia : undefined;
  const historico = valoresAvulsosHistoricoCooperado(
    data,
    cooperadoId,
    cooperativaId,
    modo === "cooperado" ? 40 : 15,
    historicoMes
  );

  const totalPendente = mesReferencia
    ? totalValoresAvulsosPendentes(data, cooperadoId, mesReferencia, cooperativaId)
    : totalValoresAvulsosPendentes(data, cooperadoId, undefined, cooperativaId);

  const gerenciaveis =
    modo === "responsavel" && cooperativaId && mesReferencia
      ? valoresAvulsosDaCooperativa(data, cooperativaId, cooperadoId, mesReferencia)
      : [];

  const historicoResponsavel = gerenciaveis.filter((v) => v.status === "pago");
  const itensHistorico = modo === "cooperado" ? historico : historicoResponsavel;
  const vazio = pendentes.length === 0 && itensHistorico.length === 0;

  return (
    <Card
      title="Créditos avulsos"
      className="mb-6"
    >
      <p className="text-sm text-gray-600 mb-4 -mt-2">
        {modo === "cooperado"
          ? "Valores extras creditados pela cooperativa — entram no total a receber do mês."
          : "Lance créditos extras para este cooperado. Somam ao pagamento do mês selecionado."}
        {mesReferencia && (
          <span className="block mt-1 font-medium text-gray-800">{formatMesReferencia(mesReferencia)}</span>
        )}
      </p>

      {totalPendente > 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-4">
          <div className="flex items-start gap-3">
            <Banknote size={22} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-emerald-900">
                {modo === "cooperado" ? "Total de créditos pendentes" : "Pendente neste mês"}
              </p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">{formatCurrency(totalPendente)}</p>
            </div>
          </div>
        </div>
      )}

      {modo === "responsavel" && lancamentoForm && onLancar && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 mb-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
            <Plus size={16} /> Adicionar crédito avulso
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
            Lançar crédito avulso
          </Button>
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
                    {v.responsavel ? ` · por ${v.responsavel}` : ""}
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

      {itensHistorico.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <History size={16} /> Histórico
            {historicoMes && (
              <span className="text-xs font-normal text-gray-500">· {formatMesReferencia(historicoMes)}</span>
            )}
          </p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden max-h-72 overflow-y-auto">
            {itensHistorico.map((v) => (
              <li key={v.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-gray-50/80">
                <div>
                  <p className="font-medium text-gray-800">{v.motivo}</p>
                  <p className="text-xs text-gray-500">
                    {formatMesReferencia(v.mesReferencia)}
                    {v.dataPagamento ? ` · pago em ${formatDate(v.dataPagamento)}` : ""}
                    {v.dataLancamento ? ` · lançado em ${formatDate(v.dataLancamento)}` : ""}
                  </p>
                </div>
                <span className="font-semibold text-gray-700 shrink-0">{formatCurrency(v.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vazio && modo === "cooperado" && (
        <p className="text-sm text-gray-500 py-2">
          Nenhum crédito avulso registrado
          {mesReferencia ? ` em ${formatMesReferencia(mesReferencia)}` : ""}.
        </p>
      )}

      {vazio && modo === "responsavel" && !onLancar && (
        <p className="text-sm text-gray-500 py-2">Nenhum crédito avulso neste mês.</p>
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
  const totalPendente = totalValoresAvulsosPendentes(data, cooperadoId, undefined, cooperativaId);

  if (pendentes.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote size={20} className="text-emerald-700" />
          <p className="font-semibold text-gray-900">Créditos avulsos a receber</p>
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

      <div className="px-5 py-3 border-t border-gray-100">
        <Link href="/ficha-corrida" className="text-sm font-medium text-green-700 hover:underline">
          Ver créditos e histórico na ficha
        </Link>
      </div>
    </div>
  );
}
