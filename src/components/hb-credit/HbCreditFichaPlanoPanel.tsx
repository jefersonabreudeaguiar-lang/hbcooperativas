"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import {
  type HbCreditFichaPlano,
  type HbCreditMensalidadePlano,
  brutoFichaPlanoCents,
  brutoFichaPlanoReais,
  formatCentsInputReais,
  parseReaisToCentsInput,
  HB_FICHA_PLANO_EMPTY,
} from "@/lib/hb-credit/hbCreditFichaPlano";
import { fetchHbCreditFichaPlano, saveHbCreditFichaPlano } from "@/services/creditApiService";
import { generateId } from "@/services/dataStore";
import { formatDate } from "@/utils/format";

type Mode = "edit" | "readonly";

type Props = {
  cnpj: string;
  cooperadoId: string;
  cooperadoNome?: string;
  mode: Mode;
};

const ENTREGA_KEYS = [
  { key: "entrega1Cents" as const, label: "Entrega 1" },
  { key: "entrega2Cents" as const, label: "Entrega 2" },
  { key: "entrega3Cents" as const, label: "Entrega 3" },
  { key: "entrega4Cents" as const, label: "Entrega 4" },
  { key: "entrega5Cents" as const, label: "Entrega 5" },
];

export function HbCreditFichaPlanoPanel({ cnpj, cooperadoId, cooperadoNome, mode }: Props) {
  const [plano, setPlano] = useState<HbCreditFichaPlano>(() => ({
    cooperadoId,
    ...HB_FICHA_PLANO_EMPTY,
  }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reload = useCallback(async () => {
    if (cnpj.length !== 14 || !cooperadoId) return;
    setLoading(true);
    setError("");
    try {
      const p = await fetchHbCreditFichaPlano(cnpj, cooperadoId);
      setPlano(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar ficha HB.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, cooperadoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const brutoCents = useMemo(() => brutoFichaPlanoCents(plano), [plano]);
  const brutoReais = useMemo(() => brutoFichaPlanoReais(plano), [plano]);

  const setEntrega = (key: keyof HbCreditFichaPlano, raw: string) => {
    if (mode !== "edit") return;
    setPlano((p) => ({ ...p, [key]: parseReaisToCentsInput(raw) }));
  };

  const addMensalidade = () => {
    if (mode !== "edit") return;
    const m: HbCreditMensalidadePlano = {
      id: generateId("mens"),
      label: "Mensalidade",
      dataCobranca: new Date().toISOString().slice(0, 10),
      valorCents: 0,
    };
    setPlano((p) => ({ ...p, mensalidades: [...(p.mensalidades ?? []), m] }));
  };

  const updateMensalidade = (id: string, patch: Partial<HbCreditMensalidadePlano>) => {
    if (mode !== "edit") return;
    setPlano((p) => ({
      ...p,
      mensalidades: (p.mensalidades ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const removeMensalidade = (id: string) => {
    if (mode !== "edit") return;
    setPlano((p) => ({ ...p, mensalidades: (p.mensalidades ?? []).filter((m) => m.id !== id) }));
  };

  const salvar = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await saveHbCreditFichaPlano(cnpj, { ...plano, cooperadoId });
      setSuccess("Ficha salva. Valor bruto HB e limites usam só este bruto.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Card className="!p-6 text-sm text-gray-500">Carregando ficha HB…</Card>;
  }

  return (
    <div className="space-y-4">
      {cooperadoNome ? (
        <p className="text-sm text-gray-600">
          Ficha HB — <span className="font-medium text-gray-900">{cooperadoNome}</span>
          {mode === "readonly" ? " (somente leitura)" : ""}
        </p>
      ) : null}
      {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}
      {success ? <AlertBanner variant="success">{success}</AlertBanner> : null}

      <Card title="Entregas (valores em R$)" className="!p-5">
        <p className="text-sm text-gray-600 mb-4">
          Sem peso — só valores lançados pelo responsável. O bruto da ficha HB é a soma das entregas 1 a 5 menos o
          desconto %.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENTREGA_KEYS.map(({ key, label }) => (
            <div key={key}>
              <Label>{label}</Label>
              {mode === "edit" ? (
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={formatCentsInputReais(plano[key] as number)}
                  onChange={(e) => setEntrega(key, e.target.value)}
                  placeholder="0,00"
                />
              ) : (
                <p className="mt-1 font-medium">{formatCentsBRL(plano[key] as number)}</p>
              )}
            </div>
          ))}
          <div>
            <Label>Desconto (%)</Label>
            {mode === "edit" ? (
              <Input
                className="mt-1 w-28"
                inputMode="decimal"
                value={String(plano.descontoPercent ?? 0)}
                onChange={(e) =>
                  setPlano((p) => ({
                    ...p,
                    descontoPercent: Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)),
                  }))
                }
              />
            ) : (
              <p className="mt-1 font-medium">{plano.descontoPercent ?? 0}%</p>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm text-green-800">Bruto da ficha HB (base do limite liberado)</p>
          <p className="text-2xl font-bold text-green-900">
            R$ {brutoReais.toFixed(2).replace(".", ",")} <span className="text-sm font-normal">({formatCentsBRL(brutoCents)})</span>
          </p>
          <p className="text-xs text-green-700 mt-1">
            Entregas com crédito HB registradas no ciclo: {plano.entregasConsumidas ?? 0} de 5
          </p>
        </div>
      </Card>

      <Card title="Mensalidades" className="!p-5">
        <p className="text-sm text-gray-600 mb-3">
          Com data de cobrança vencida, a mensalidade é debitada automaticamente no próximo uso do crédito HB.
        </p>
        <div className="space-y-3">
          {(plano.mensalidades ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma mensalidade cadastrada.</p>
          ) : (
            (plano.mensalidades ?? []).map((m) => (
              <div key={m.id} className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-3">
                {mode === "edit" ? (
                  <>
                    <div className="flex-1 min-w-[120px]">
                      <Label>Descrição</Label>
                      <Input
                        className="mt-1"
                        value={m.label}
                        onChange={(e) => updateMensalidade(m.id, { label: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Cobrança</Label>
                      <Input
                        type="date"
                        className="mt-1"
                        value={m.dataCobranca}
                        onChange={(e) => updateMensalidade(m.id, { dataCobranca: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Valor (R$)</Label>
                      <Input
                        className="mt-1 w-28"
                        inputMode="decimal"
                        value={formatCentsInputReais(m.valorCents)}
                        onChange={(e) => updateMensalidade(m.id, { valorCents: parseReaisToCentsInput(e.target.value) })}
                      />
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => removeMensalidade(m.id)} disabled={busy}>
                      Remover
                    </Button>
                  </>
                ) : (
                  <div className="text-sm">
                    <span className="font-medium">{m.label}</span>
                    {" · "}
                    {formatCentsBRL(m.valorCents)}
                    {" · venc. "}
                    {formatDate(m.dataCobranca)}
                    {m.cobradaEm ? (
                      <span className="ml-2 text-green-700">(cobrada)</span>
                    ) : m.dataCobranca <= new Date().toISOString().slice(0, 10) ? (
                      <span className="ml-2 text-amber-700">(pendente no crédito)</span>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {mode === "edit" ? (
          <Button className="mt-3" size="sm" variant="secondary" onClick={addMensalidade} disabled={busy}>
            Adicionar mensalidade
          </Button>
        ) : null}
      </Card>

      {mode === "edit" ? (
        <div className="flex gap-2">
          <Button onClick={() => void salvar()} disabled={busy}>
            Salvar ficha e atualizar bruto HB
          </Button>
          <Button variant="secondary" onClick={() => void reload()} disabled={busy || loading}>
            Recarregar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
