"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopDiscountAllocation, ContaCoopDiscountPoolResumo } from "@/modules/hb-credit/types";
import { fetchDiscountPool, postSweepCashback } from "@/services/creditApiService";

type Props = {
  cnpj: string;
  cooperadoNome: (id: string) => string;
};

function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ContaCoopDescontosPanel({ cnpj, cooperadoNome }: Props) {
  const [mesReferencia, setMesReferencia] = useState(mesAtual());
  const [resumo, setResumo] = useState<ContaCoopDiscountPoolResumo | null>(null);
  const [allocations, setAllocations] = useState<ContaCoopDiscountAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reload = useCallback(async () => {
    if (!cnpj) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchDiscountPool(cnpj, mesReferencia);
      setResumo(data.resumo ?? null);
      setAllocations(data.allocations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar descontos.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, mesReferencia]);

  useEffect(() => {
    reload();
  }, [reload]);

  const converterCashback = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await postSweepCashback(cnpj, mesReferencia);
      setSuccess(
        `Cashback não usado convertido em crédito: ${formatCentsBRL(result.totalCents ?? 0)} para ${result.cooperados ?? 0} cooperado(s).`
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao converter cashback.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 !p-4">
        <div>
          <Label>Mês de referência</Label>
          <Input
            type="month"
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        <Button variant="secondary" onClick={reload} disabled={loading || busy}>
          Atualizar
        </Button>
      </Card>

      {loading && !resumo ? (
        <Card className="!p-8 text-center text-sm text-gray-500">Carregando pool contábil…</Card>
      ) : resumo ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Compras (bruto)" value={formatCentsBRL(resumo.totalGrossCents)} />
            <StatCard title="Desconto dos mercados" value={formatCentsBRL(resumo.totalDiscountCents)} />
            <StatCard title="Líquido mercados" value={formatCentsBRL(resumo.totalNetPartnerCents)} />
            <StatCard title="Transações" value={String(resumo.transacoesCount)} />
          </div>

          <Card className="space-y-3 !p-5">
            <h3 className="font-semibold text-gray-900">Split do desconto (sincronizado contabilidade)</h3>
            <p className="text-sm text-gray-600">
              Cooperado paga o valor total da compra. O mercado recebe só o líquido na liquidação. O desconto retorna à
              cooperativa dividido em:
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-green-200 bg-green-50/60 p-4">
                <p className="text-xs font-medium text-green-800">70% cashback cooperado</p>
                <p className="mt-1 text-xl font-bold text-green-900">{formatCentsBRL(resumo.totalCashbackCents)}</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <p className="text-xs font-medium text-blue-800">20% aplicativo (liquidação)</p>
                <p className="mt-1 text-xl font-bold text-blue-900">{formatCentsBRL(resumo.totalAppCents)}</p>
                <p className="mt-1 text-xs text-blue-700">
                  Liquidado: {formatCentsBRL(resumo.appLiquidadoCents)} · Pendente:{" "}
                  {formatCentsBRL(resumo.appPendenteCents)}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-xs font-medium text-amber-800">10% cooperativa (liquidação)</p>
                <p className="mt-1 text-xl font-bold text-amber-900">{formatCentsBRL(resumo.totalCoopCents)}</p>
                <p className="mt-1 text-xs text-amber-700">
                  Liquidado: {formatCentsBRL(resumo.coopLiquidadoCents)} · Pendente:{" "}
                  {formatCentsBRL(resumo.coopPendenteCents)}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              App e cooperativa são marcados como liquidados quando o pagamento ao mercado é registrado na aba Liquidar.
            </p>
          </Card>

          <Card className="space-y-3 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">Cashback não usado</h3>
              <p className="text-sm text-gray-600">
                Converte saldo de cashback restante em crédito Conta Coop para cada cooperado (fechamento do mês).
              </p>
            </div>
            <Button onClick={converterCashback} disabled={busy}>
              Converter cashback não usado em crédito
            </Button>
          </Card>

          {!!allocations.length && (
            <Card className="overflow-x-auto !p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Cooperado</th>
                    <th className="p-3">Mercado</th>
                    <th className="p-3">Bruto</th>
                    <th className="p-3">Desconto</th>
                    <th className="p-3">Líquido</th>
                    <th className="p-3">70%</th>
                    <th className="p-3">20%</th>
                    <th className="p-3">10%</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="p-3 whitespace-nowrap">{new Date(a.createdAt).toLocaleString("pt-BR")}</td>
                      <td className="p-3">{cooperadoNome(a.cooperadoId)}</td>
                      <td className="p-3">{a.partnerNome ?? a.partnerId}</td>
                      <td className="p-3 font-mono">{formatCentsBRL(a.grossCents)}</td>
                      <td className="p-3 font-mono">{formatCentsBRL(a.discountCents)}</td>
                      <td className="p-3 font-mono">{formatCentsBRL(a.netPartnerCents)}</td>
                      <td className="p-3 font-mono text-green-800">{formatCentsBRL(a.cashbackCents)}</td>
                      <td className="p-3 font-mono text-blue-800">{formatCentsBRL(a.appCents)}</td>
                      <td className="p-3 font-mono text-amber-800">{formatCentsBRL(a.coopCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {!allocations.length && (
            <Card className="!p-8 text-center text-sm text-gray-500">
              Nenhuma compra com desconto contratual neste mês.
            </Card>
          )}
        </>
      ) : null}

      {success && (
        <AlertBanner variant="info" title="Concluído">
          {success}
        </AlertBanner>
      )}
      {error && <AlertBanner variant="error">{error}</AlertBanner>}
    </div>
  );
}
