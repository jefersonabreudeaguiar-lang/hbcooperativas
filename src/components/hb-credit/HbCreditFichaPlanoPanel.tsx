"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  somaEntregasPlanoCents,
} from "@/lib/hb-credit/hbCreditFichaPlano";
import { HB_FICHA_PLANO_UPDATED_EVENT } from "@/lib/hb-credit/hbCreditFichaPlanoEvents";
import { fetchHbCreditFichaPlano, saveHbCreditFichaPlano } from "@/services/creditApiService";
import { HbCreditEntregaReaisInput } from "@/components/hb-credit/HbCreditEntregaReaisInput";
import {
  notifyHbCreditAccountCacheUpdated,
  notifyHbCreditLimiteSynced,
} from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { notifyHbFichaPlanoUpdated } from "@/lib/hb-credit/hbCreditFichaPlanoEvents";
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
  const planoLiveRef = useRef(plano);
  planoLiveRef.current = plano;

  const patchPlano = useCallback((patch: Partial<HbCreditFichaPlano>) => {
    setPlano((p) => {
      const next = { ...p, ...patch };
      planoLiveRef.current = next;
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    if (cnpj.length !== 14 || !cooperadoId) return;
    setLoading(true);
    setError("");
    try {
      const p = await fetchHbCreditFichaPlano(cnpj, cooperadoId);
      planoLiveRef.current = p;
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

  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ cooperadoId?: string }>).detail;
      if (detail?.cooperadoId && detail.cooperadoId !== cooperadoId) return;
      void reload();
    };
    window.addEventListener(HB_FICHA_PLANO_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(HB_FICHA_PLANO_UPDATED_EVENT, onUpdated);
  }, [cooperadoId, reload]);

  const brutoCents = useMemo(() => brutoFichaPlanoCents(plano), [plano]);
  const brutoReais = useMemo(() => brutoFichaPlanoReais(plano), [plano]);

  const addMensalidade = () => {
    if (mode !== "edit") return;
    const m: HbCreditMensalidadePlano = {
      id: generateId("mens"),
      label: "Mensalidade",
      dataCobranca: new Date().toISOString().slice(0, 10),
      valorCents: 0,
    };
    patchPlano({ mensalidades: [...(planoLiveRef.current.mensalidades ?? []), m] });
  };

  const updateMensalidade = (id: string, patch: Partial<HbCreditMensalidadePlano>) => {
    if (mode !== "edit") return;
    patchPlano({
      mensalidades: (planoLiveRef.current.mensalidades ?? []).map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    });
  };

  const removeMensalidade = (id: string) => {
    if (mode !== "edit") return;
    patchPlano({
      mensalidades: (planoLiveRef.current.mensalidades ?? []).filter((m) => m.id !== id),
    });
  };

  const salvar = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (typeof document !== "undefined") {
        (document.activeElement as HTMLElement | null)?.blur?.();
        await new Promise((r) => setTimeout(r, 0));
      }
      const toSave = { ...planoLiveRef.current, cooperadoId };
      const { limiteWarning } = await saveHbCreditFichaPlano(cnpj, toSave);
      notifyHbFichaPlanoUpdated(cooperadoId);
      notifyHbCreditLimiteSynced({ immediate: true });
      notifyHbCreditAccountCacheUpdated();
      setSuccess(
        limiteWarning
          ? `Ficha salva na nuvem. ${limiteWarning}`
          : "Ficha salva. Limite HB liberado e visível para o cooperado."
      );
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
        {mode === "readonly" ? (
          <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[280px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="p-3">Entrega</th>
                  <th className="p-3 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {ENTREGA_KEYS.map(({ key, label }) => (
                  <tr key={key} className="border-t border-gray-100">
                    <td className="p-3 font-medium text-gray-900">{label}</td>
                    <td className="p-3 text-right font-semibold text-green-800">
                      {formatCentsBRL(plano[key] as number)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-gray-50/80">
                  <td className="p-3 text-gray-600">Soma entregas</td>
                  <td className="p-3 text-right font-medium">{formatCentsBRL(somaEntregasPlanoCents(plano))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENTREGA_KEYS.map(({ key, label }) => (
            <div key={key}>
              <Label>{label}</Label>
              {mode === "edit" ? (
                <HbCreditEntregaReaisInput
                  cents={plano[key] as number}
                  disabled={busy}
                  onCommit={(c) => patchPlano({ [key]: c })}
                />
              ) : null}
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
                  patchPlano({
                    descontoPercent: Math.min(
                      100,
                      Math.max(0, Number(e.target.value.replace(",", ".")) || 0)
                    ),
                  })
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
                      <HbCreditEntregaReaisInput
                        cents={m.valorCents}
                        disabled={busy}
                        onCommit={(c) => updateMensalidade(m.id, { valorCents: c })}
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
