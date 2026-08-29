"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { PageHeader } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  fetchCreditDashboard,
  fetchCreditLimites,
  fetchCreditParceiros,
  postCreditLimites,
  postCreditParceiroStatus,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { buildCreditosBaseMap } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import type { ContaCoopDashboard, ContaCoopLimiteCooperado, ContaCoopParceiro } from "@/modules/hb-credit/types";
import { cn } from "@/utils/format";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

type PreviewColetivo = {
  ok?: boolean;
  error?: string;
  percentual?: number;
  limiteAtualTotal?: number;
  novoLimiteTotal?: number;
  totalApos?: number;
  itens?: Array<{
    cooperadoId: string;
    creditoBaseCents: number;
    novoLimiteCents: number;
    ajustadoPorUso?: boolean;
  }>;
};

type Tab = "painel" | "limites" | "mercados";

export default function ContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate>
        <ContaCoopContent />
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function ContaCoopContent() {
  const data = useAppData();
  const { user } = usePermissions();
  const [tab, setTab] = useState<Tab>("painel");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<ContaCoopDashboard | null>(null);
  const [limites, setLimites] = useState<ContaCoopLimiteCooperado[]>([]);
  const [parceiros, setParceiros] = useState<ContaCoopParceiro[]>([]);
  const [tetoReais, setTetoReais] = useState("");
  const [cooperadoId, setCooperadoId] = useState("");
  const [novoLimiteReais, setNovoLimiteReais] = useState("");
  const [percentualColetivo, setPercentualColetivo] = useState("");
  const [previewColetivo, setPreviewColetivo] = useState<PreviewColetivo | null>(null);
  const [busy, setBusy] = useState(false);

  const cnpj = useMemo(() => {
    if (!user || !data) return "";
    if (user.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    return coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";
  }, [user, data]);

  const cooperadosAtivos = useMemo(() => {
    if (!data || !user?.cooperativaId) return [];
    return data.cooperados.filter((c) => c.cooperativaId === user.cooperativaId && c.status === "ativo");
  }, [data, user?.cooperativaId]);

  const cooperadoNome = useCallback(
    (id: string) => cooperadosAtivos.find((c) => c.id === id)?.nomeCompleto ?? id,
    [cooperadosAtivos]
  );

  const creditosBaseColetivo = useMemo(() => {
    if (!data || !cooperadosAtivos.length) return {};
    return buildCreditosBaseMap(
      data,
      cooperadosAtivos.map((c) => c.id),
      user?.cooperativaId
    );
  }, [data, cooperadosAtivos, user?.cooperativaId]);

  const reload = useCallback(async () => {
    if (!cnpj) return;
    setLoading(true);
    setError("");
    try {
      const [dash, lim, parc] = await Promise.all([
        fetchCreditDashboard(cnpj),
        fetchCreditLimites(cnpj),
        fetchCreditParceiros(cnpj),
      ]);
      setDashboard(dash);
      setLimites(lim);
      setParceiros(parc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar Conta Coop.");
    } finally {
      setLoading(false);
    }
  }, [cnpj]);

  useEffect(() => {
    reload();
  }, [reload]);

  const salvarTeto = async () => {
    if (!cnpj) return;
    setBusy(true);
    setError("");
    try {
      await postCreditLimites({ action: "set_teto", cnpj, tetoReais: Number(tetoReais.replace(",", ".")) });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar teto.");
    } finally {
      setBusy(false);
    }
  };

  const salvarLimiteIndividual = async () => {
    if (!cnpj || !cooperadoId) return;
    setBusy(true);
    setError("");
    try {
      await postCreditLimites({
        action: "set_individual",
        cnpj,
        cooperadoId,
        novoLimiteReais: Number(novoLimiteReais.replace(",", ".")),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao liberar limite.");
    } finally {
      setBusy(false);
    }
  };

  const previewColetivoAction = async () => {
    if (!cnpj) return;
    const percentual = Number(percentualColetivo.replace(",", "."));
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      setError("Informe um percentual entre 0 e 100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await postCreditLimites({
        action: "preview_coletivo",
        cnpj,
        cooperadoIds: cooperadosAtivos.map((c) => c.id),
        percentual,
        creditosBaseCents: creditosBaseColetivo,
      });
      setPreviewColetivo((res as { preview?: PreviewColetivo }).preview ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na prévia.");
    } finally {
      setBusy(false);
    }
  };

  const salvarColetivo = async () => {
    if (!cnpj) return;
    const percentual = Number(percentualColetivo.replace(",", "."));
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      setError("Informe um percentual entre 0 e 100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postCreditLimites({
        action: "set_coletivo",
        cnpj,
        cooperadoIds: cooperadosAtivos.map((c) => c.id),
        percentual,
        creditosBaseCents: creditosBaseColetivo,
      });
      setPreviewColetivo(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao liberar limites.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBloqueio = async (limite: ContaCoopLimiteCooperado) => {
    if (!cnpj) return;
    setBusy(true);
    try {
      await postCreditLimites({
        action: "set_bloqueado",
        cnpj,
        cooperadoId: limite.cooperadoId,
        bloqueado: !limite.bloqueado,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao alterar bloqueio.");
    } finally {
      setBusy(false);
    }
  };

  const atualizarMercado = async (parceiroId: string, status: "ativo" | "bloqueado") => {
    if (!cnpj) return;
    setBusy(true);
    try {
      await postCreditParceiroStatus(cnpj, parceiroId, status);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar mercado.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !dashboard) return <PageSkeleton />;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Conta Coop" subtitle="Limite liberado → compra → débito → recebível (servidor como autoridade)" />

      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      <div className="flex flex-wrap gap-2">
        {(["painel", "limites", "mercados"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium border",
              tab === t ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-700 border-gray-200"
            )}
          >
            {t === "painel" ? "Painel" : t === "limites" ? "Limites" : "Mercados"}
          </button>
        ))}
      </div>

      {tab === "painel" && dashboard && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Teto global</h3>
            <p className="text-sm text-gray-600">Teto: {formatCentsBRL(dashboard.teto.tetoGlobalCents)}</p>
            <p className="text-sm text-gray-600">Distribuído: {formatCentsBRL(dashboard.teto.limiteDistribuidoCents)}</p>
            <p className="text-sm font-medium text-green-800">
              Restante: {formatCentsBRL(dashboard.teto.restanteParaLiberarCents)}
            </p>
            <div className="flex gap-2 items-end pt-2">
              <div className="flex-1">
                <Label htmlFor="teto">Novo teto (R$)</Label>
                <Input id="teto" value={tetoReais} onChange={(e) => setTetoReais(e.target.value)} placeholder="100000" />
              </div>
              <Button onClick={salvarTeto} disabled={busy}>Salvar teto</Button>
            </div>
          </Card>
          <Card className="p-5 space-y-2">
            <h3 className="font-semibold text-gray-900">Cooperados (agregado)</h3>
            <p className="text-sm">Limite liberado: {formatCentsBRL(dashboard.agregadoCooperados.limiteLiberadoCents)}</p>
            <p className="text-sm">Usado: {formatCentsBRL(dashboard.agregadoCooperados.valorUsadoCents)}</p>
            <p className="text-sm font-medium">Disponível: {formatCentsBRL(dashboard.agregadoCooperados.valorDisponivelCents)}</p>
            <p className="text-xs text-gray-500 pt-2">
              Mercados pendentes: {dashboard.parceirosPendentes} · Transações (7 dias): {dashboard.transacoesRecentes}
            </p>
          </Card>
        </div>
      )}

      {tab === "limites" && (
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Individual</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Cooperado</Label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={cooperadoId}
                  onChange={(e) => setCooperadoId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {cooperadosAtivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Novo limite (R$)</Label>
                <Input value={novoLimiteReais} onChange={(e) => setNovoLimiteReais(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={salvarLimiteIndividual} disabled={busy || !cooperadoId}>Salvar</Button>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">Coletivo ({cooperadosAtivos.length} cooperados)</h3>
            <p className="text-sm text-gray-600">
              Libera para cada cooperado um percentual do crédito pendente na ficha (Quanto vou receber).
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label>Percentual do crédito (%)</Label>
                <Input
                  value={percentualColetivo}
                  onChange={(e) => setPercentualColetivo(e.target.value)}
                  className="w-40"
                  placeholder="50"
                  inputMode="decimal"
                />
              </div>
              <Button variant="secondary" onClick={previewColetivoAction} disabled={busy}>Prévia</Button>
              <Button onClick={salvarColetivo} disabled={busy}>Liberar todos</Button>
            </div>
            {previewColetivo && (
              <div className="text-sm bg-gray-50 border rounded-lg p-3 space-y-3">
                <div className="space-y-1">
                  <p>Percentual: {previewColetivo.percentual ?? percentualColetivo}%</p>
                  <p>Limite atual total: {formatCentsBRL(Number(previewColetivo.limiteAtualTotal ?? 0))}</p>
                  <p>Novo pacote: {formatCentsBRL(Number(previewColetivo.novoLimiteTotal ?? 0))}</p>
                  <p className="font-medium">Total após: {formatCentsBRL(Number(previewColetivo.totalApos ?? 0))}</p>
                  {!previewColetivo.ok && (
                    <p className="text-red-600">{String(previewColetivo.error ?? "Ultrapassa teto")}</p>
                  )}
                </div>
                {!!previewColetivo.itens?.length && (
                  <div className="overflow-x-auto border rounded-lg bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="p-2">Cooperado</th>
                          <th className="p-2">Crédito (ficha)</th>
                          <th className="p-2">Novo limite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewColetivo.itens.map((item) => (
                          <tr key={item.cooperadoId} className="border-t">
                            <td className="p-2">{cooperadoNome(item.cooperadoId)}</td>
                            <td className="p-2">{formatCentsBRL(item.creditoBaseCents)}</td>
                            <td className="p-2">
                              {formatCentsBRL(item.novoLimiteCents)}
                              {item.ajustadoPorUso && (
                                <span className="block text-amber-700">Mínimo = já usado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-3">Cooperado</th>
                  <th className="p-3">Crédito (ficha)</th>
                  <th className="p-3">Liberado</th>
                  <th className="p-3">Usado</th>
                  <th className="p-3">Disponível</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {limites.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-3">{cooperadoNome(l.cooperadoId)}</td>
                    <td className="p-3">{formatCentsBRL(creditosBaseColetivo[l.cooperadoId] ?? 0)}</td>
                    <td className="p-3">{formatCentsBRL(l.limiteLiberadoCents)}</td>
                    <td className="p-3">{formatCentsBRL(l.valorUsadoCents)}</td>
                    <td className="p-3">{formatCentsBRL(l.valorDisponivelCents)}</td>
                    <td className="p-3">
                      <Button size="sm" variant="secondary" onClick={() => toggleBloqueio(l)} disabled={busy}>
                        {l.bloqueado ? "Desbloquear" : "Bloquear"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!limites.length && (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-500">Nenhum limite liberado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "mercados" && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Mercado</th>
                <th className="p-3">CNPJ</th>
                <th className="p-3">Status</th>
                <th className="p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {parceiros.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">{p.nomeMercado}</td>
                  <td className="p-3 font-mono text-xs">{p.cnpjMercado}</td>
                  <td className="p-3 capitalize">{p.status}</td>
                  <td className="p-3 space-x-2">
                    {p.status === "pendente" && (
                      <Button size="sm" onClick={() => atualizarMercado(p.id, "ativo")} disabled={busy}>Aprovar</Button>
                    )}
                    {p.status !== "bloqueado" && p.status !== "pendente" && (
                      <Button size="sm" variant="secondary" onClick={() => atualizarMercado(p.id, "bloqueado")} disabled={busy}>
                        Bloquear
                      </Button>
                    )}
                    {p.status === "bloqueado" && (
                      <Button size="sm" onClick={() => atualizarMercado(p.id, "ativo")} disabled={busy}>Reativar</Button>
                    )}
                  </td>
                </tr>
              ))}
              {!parceiros.length && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-500">Nenhum mercado cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
