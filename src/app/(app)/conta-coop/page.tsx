"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { TesoureiroAreaGuard } from "@/components/permissions/TesoureiroAreaGuard";
import { ContaCoopSegmentTabs } from "@/components/hb-credit/ContaCoopSegmentTabs";
import { ContaCoopLiquidacaoPanel } from "@/components/hb-credit/ContaCoopLiquidacaoPanel";
import { ContaCoopFiscalNotesConferenciaPanel } from "@/components/hb-credit/ContaCoopFiscalNotesConferenciaPanel";
import { ContaCoopEstornosPanel } from "@/components/hb-credit/ContaCoopEstornosPanel";
import { ContaCoopDescontosPanel } from "@/components/hb-credit/ContaCoopDescontosPanel";
import { Card, StatCard } from "@/components/ui/Card";
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
  postUpdatePartnerDiscount,
  resetMercadoFinancialPin,
  syncCreditLimiteFromFicha,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { buildCreditosBaseMap } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import type { ContaCoopDashboard, ContaCoopLimiteCooperado, ContaCoopParceiro } from "@/modules/hb-credit/types";
import { cn, formatMesReferencia } from "@/utils/format";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

type PreviewColetivo = {
  ok?: boolean;
  error?: string;
  aviso?: string;
  percentual?: number;
  tetoGlobal?: number;
  tetoGlobalPercent?: number;
  limiteAtualTotal?: number;
  novoLimiteTotal?: number;
  totalApos?: number;
  autoAjusteTetoCents?: number;
  itens?: Array<{
    cooperadoId: string;
    creditoBaseCents: number;
    novoLimiteCents: number;
    ajustadoPorUso?: boolean;
  }>;
};

type Tab = "painel" | "limites" | "mercados" | "descontos" | "conferir_nf" | "liquidar" | "estornos";

export default function ContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate>
        <TesoureiroAreaGuard>
          <ContaCoopContent />
        </TesoureiroAreaGuard>
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function ContaCoopContent() {
  const data = useAppData();
  const { user } = usePermissions();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(() => {
    if (
      initialTab === "conferir_nf" ||
      initialTab === "liquidar" ||
      initialTab === "estornos" ||
      initialTab === "limites" ||
      initialTab === "mercados" ||
      initialTab === "descontos"
    ) {
      return initialTab;
    }
    return "painel";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dashboard, setDashboard] = useState<ContaCoopDashboard | null>(null);
  const [limites, setLimites] = useState<ContaCoopLimiteCooperado[]>([]);
  const [parceiros, setParceiros] = useState<ContaCoopParceiro[]>([]);
  const [tetoPercentual, setTetoPercentual] = useState("");
  const [cooperadoId, setCooperadoId] = useState("");
  const [novoLimiteReais, setNovoLimiteReais] = useState("");
  const [percentualColetivo, setPercentualColetivo] = useState("");
  const [previewColetivo, setPreviewColetivo] = useState<PreviewColetivo | null>(null);
  const [busy, setBusy] = useState(false);
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const [approveDiscountDrafts, setApproveDiscountDrafts] = useState<Record<string, string>>({});

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
      if (cooperadosAtivos.length) {
        await syncCreditLimiteFromFicha({
          cnpj,
          cooperadoIds: cooperadosAtivos.map((c) => c.id),
          creditosBaseCents: creditosBaseColetivo,
        }).catch(() => {});
      }
      const [dash, lim, parc] = await Promise.all([
        fetchCreditDashboard(cnpj, creditosBaseColetivo),
        fetchCreditLimites(cnpj),
        fetchCreditParceiros(cnpj),
      ]);
      setDashboard(dash);
      setLimites(lim);
      setParceiros(parc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar HB Créditos.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, creditosBaseColetivo, cooperadosAtivos]);

  useEffect(() => {
    reload();
  }, [reload]);

  const salvarTeto = async () => {
    if (!cnpj) return;
    setBusy(true);
    setError("");
    try {
      await postCreditLimites({
        action: "set_teto",
        cnpj,
        tetoPercentual: Number(tetoPercentual.replace(",", ".")),
        creditosBaseCents: creditosBaseColetivo,
      });
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
        creditosBaseCents: creditosBaseColetivo,
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

  const atualizarMercado = async (parceiroId: string, status: "ativo" | "bloqueado", partnerDiscountPercent?: number) => {
    if (!cnpj) return;
    setBusy(true);
    try {
      await postCreditParceiroStatus(cnpj, parceiroId, status, partnerDiscountPercent);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar mercado.");
    } finally {
      setBusy(false);
    }
  };

  const salvarDescontoMercado = async (parceiroId: string) => {
    if (!cnpj) return;
    const raw =
      discountDrafts[parceiroId] ??
      approveDiscountDrafts[parceiroId] ??
      String(parceiros.find((p) => p.id === parceiroId)?.partnerDiscountPercent ?? "");
    const percent = Number(raw.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Informe um desconto entre 0 e 100%.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postUpdatePartnerDiscount(cnpj, parceiroId, percent);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar desconto.");
    } finally {
      setBusy(false);
    }
  };

  const resetarPinMercado = async (parceiro: ContaCoopParceiro) => {
    if (!cnpj) return;
    const msg =
      `Resetar o PIN financeiro de estorno de "${parceiro.nomeMercado}"?\n\n` +
      "O mercado precisará cadastrar um PIN novo na aba Mais do painel do mercado antes de solicitar estornos.";
    if (!window.confirm(msg)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await resetMercadoFinancialPin(cnpj, parceiro.id);
      setSuccess(`PIN de estorno resetado para ${parceiro.nomeMercado}. O mercado deve cadastrar um PIN novo.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao resetar PIN do mercado.");
    } finally {
      setBusy(false);
    }
  };

  const cooperativaNome = useMemo(() => {
    if (!user || !data) return "Cooperativa";
    const coopId = getUserCooperativaId(user, data);
    return data.cooperativas.find((c) => c.id === coopId)?.nome ?? "Cooperativa";
  }, [user, data]);

  const statusMercadoLabel = (status: string) => {
    if (status === "ativo") return "Ativo";
    if (status === "pendente") return "Aguardando aprovação";
    if (status === "bloqueado") return "Bloqueado";
    return status;
  };

  const pinMercadoBloqueado = (parceiro: ContaCoopParceiro) =>
    Boolean(parceiro.pinLockedUntil && new Date(parceiro.pinLockedUntil).getTime() > Date.now());

  if (loading && !dashboard) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-700">HB Créditos</p>
        <h1 className="text-2xl font-bold text-gray-900">Gestão do crédito interno</h1>
        <p className="text-sm text-gray-500">Libere limites, acompanhe uso e gerencie mercados parceiros</p>
      </header>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && (
        <AlertBanner variant="success" title="Pronto" onDismiss={() => setSuccess("")}>
          {success}
        </AlertBanner>
      )}

      <ContaCoopSegmentTabs
        tabs={[
          { id: "painel", label: "Visão geral" },
          { id: "limites", label: "Limites" },
          { id: "mercados", label: "Mercados" },
          { id: "descontos", label: "Descontos" },
          { id: "conferir_nf", label: "Conferir NFs" },
          { id: "liquidar", label: "Liquidar" },
          { id: "estornos", label: "Estornos" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "painel" && dashboard && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Disponível (todos)"
              value={formatCentsBRL(dashboard.agregadoCooperados.valorDisponivelCents)}
              subtitle={`Usado ${formatCentsBRL(dashboard.agregadoCooperados.valorUsadoCents)}`}
              variant="success"
            />
            <StatCard
              title="Crédito liberado"
              value={formatCentsBRL(dashboard.agregadoCooperados.limiteLiberadoCents)}
              variant="default"
            />
            <StatCard
              title="Ainda pode liberar"
              value={formatCentsBRL(dashboard.teto.restanteParaLiberarCents)}
              subtitle={`Teto ${dashboard.teto.tetoGlobalPercent}%`}
              variant="gold"
            />
            <StatCard
              title="Atividade (7 dias)"
              value={String(dashboard.transacoesRecentes)}
              subtitle={`${dashboard.parceirosPendentes} mercado(s) pendente(s)`}
              variant="default"
            />
          </div>

          <div className="space-y-2">
            <div>
              <h3 className="font-semibold text-gray-900">
                Lançamentos — {formatMesReferencia(dashboard.lancamentosMes.mesReferencia)}
              </h3>
              <p className="text-sm text-gray-600">
                Valores calculados a partir das transações confirmadas no banco (compras, estornos e recebíveis).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Compras (bruto)"
                value={formatCentsBRL(dashboard.lancamentosMes.comprasBrutoCents)}
                subtitle={`${dashboard.lancamentosMes.comprasQtd} pagamento(s)`}
                variant="default"
              />
              <StatCard
                title="Estornos"
                value={formatCentsBRL(dashboard.lancamentosMes.estornosCents)}
                subtitle={`${dashboard.lancamentosMes.estornosQtd} estorno(s)`}
                variant="default"
              />
              <StatCard
                title="Desconto mercados"
                value={formatCentsBRL(dashboard.lancamentosMes.descontoMercadosCents)}
                subtitle={`Líquido mercados ${formatCentsBRL(dashboard.lancamentosMes.liquidoMercadosCents)}`}
                variant="gold"
              />
              <StatCard
                title="Crédito debitado"
                value={formatCentsBRL(dashboard.lancamentosMes.creditoDebitadoCents)}
                subtitle={`Cashback saldo ${formatCentsBRL(dashboard.lancamentosMes.cashbackSaldoCooperadosCents)}`}
                variant="success"
              />
            </div>
            <StatCard
              title="A receber mercados (aberto)"
              value={formatCentsBRL(dashboard.lancamentosMes.recebivelMercadosAbertoCents)}
              subtitle="Recebíveis em aberto, elegíveis ou em processamento"
              variant="default"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-4 !p-5">
              <div>
                <h3 className="font-semibold text-gray-900">Teto da cooperativa</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Limite máximo que a cooperativa pode distribuir entre cooperados, com base na ficha corrida.
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1">
                <p>
                  <span className="text-gray-500">Teto atual:</span>{" "}
                  <strong>
                    {dashboard.teto.tetoGlobalPercent}% = {formatCentsBRL(dashboard.teto.tetoGlobalCents)}
                  </strong>
                </p>
                <p>
                  <span className="text-gray-500">Crédito na ficha:</span>{" "}
                  {formatCentsBRL(dashboard.teto.creditoBaseTotalCents)}
                </p>
                <p>
                  <span className="text-gray-500">Já distribuído:</span>{" "}
                  {formatCentsBRL(dashboard.teto.limiteDistribuidoCents)}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="teto">Alterar teto (%)</Label>
                  <Input
                    id="teto"
                    value={tetoPercentual}
                    onChange={(e) => setTetoPercentual(e.target.value)}
                    placeholder={String(dashboard.teto.tetoGlobalPercent)}
                    inputMode="decimal"
                  />
                </div>
                <Button onClick={salvarTeto} disabled={busy}>
                  Salvar teto
                </Button>
              </div>
            </Card>

            <Card className="space-y-3 !p-5">
              <h3 className="font-semibold text-gray-900">Como funciona</h3>
              <ol className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">
                    1
                  </span>
                  <span>Defina o teto e libere crédito para os cooperados</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">
                    2
                  </span>
                  <span>Cooperado paga nos mercados parceiros com QR Code</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">
                    3
                  </span>
                  <span>A cooperativa recebe e liquida os recebíveis depois</span>
                </li>
              </ol>
            </Card>
          </div>
        </div>
      )}

      {tab === "limites" && (
        <div className="space-y-6">
          <Card className="space-y-4 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">Liberação individual</h3>
              <p className="text-sm text-gray-600">Ajuste o limite de um cooperado específico.</p>
            </div>
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

          <Card className="space-y-4 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">
                Liberação coletiva · {cooperadosAtivos.length} cooperados
              </h3>
              <p className="text-sm text-gray-600">
                Aplica o mesmo percentual do crédito na ficha para todos de uma vez. Use Prévia antes de confirmar.
              </p>
            </div>
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
                  <p>
                    Teto global: {previewColetivo.tetoGlobalPercent ?? dashboard?.teto.tetoGlobalPercent ?? 100}% ={" "}
                    {formatCentsBRL(Number(previewColetivo.tetoGlobal ?? 0))}
                  </p>
                  <p>Limite atual total: {formatCentsBRL(Number(previewColetivo.limiteAtualTotal ?? 0))}</p>
                  <p>Novo pacote: {formatCentsBRL(Number(previewColetivo.novoLimiteTotal ?? 0))}</p>
                  <p className="font-medium">Total após: {formatCentsBRL(Number(previewColetivo.totalApos ?? 0))}</p>
                  {!previewColetivo.ok && (
                    <p className="text-red-600">{String(previewColetivo.error ?? "Ultrapassa teto")}</p>
                  )}
                  {previewColetivo.ok && previewColetivo.aviso && (
                    <p className="text-amber-800">{previewColetivo.aviso}</p>
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

          <div className="space-y-3 md:hidden">
            {limites.map((l) => (
              <Card key={l.id} className="space-y-3 !p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{cooperadoNome(l.cooperadoId)}</p>
                    {l.bloqueado && (
                      <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Bloqueado
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-bold text-green-800">{formatCentsBRL(l.valorDisponivelCents)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                  <div>
                    <p className="text-gray-400">Ficha</p>
                    <p className="font-medium">{formatCentsBRL(creditosBaseColetivo[l.cooperadoId] ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Liberado</p>
                    <p className="font-medium">{formatCentsBRL(l.limiteLiberadoCents)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Usado</p>
                    <p className="font-medium">{formatCentsBRL(l.valorUsadoCents)}</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => toggleBloqueio(l)} disabled={busy}>
                  {l.bloqueado ? "Desbloquear cooperado" : "Bloquear pagamentos"}
                </Button>
              </Card>
            ))}
            {!limites.length && (
              <Card className="!p-6 text-center text-sm text-gray-500">Nenhum limite liberado ainda.</Card>
            )}
          </div>

          <Card className="hidden overflow-hidden !p-0 md:block">
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
                    <td className="p-3">
                      {cooperadoNome(l.cooperadoId)}
                      {l.bloqueado && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Bloqueado</span>
                      )}
                    </td>
                    <td className="p-3">{formatCentsBRL(creditosBaseColetivo[l.cooperadoId] ?? 0)}</td>
                    <td className="p-3">{formatCentsBRL(l.limiteLiberadoCents)}</td>
                    <td className="p-3">{formatCentsBRL(l.valorUsadoCents)}</td>
                    <td className="p-3 font-medium text-green-800">{formatCentsBRL(l.valorDisponivelCents)}</td>
                    <td className="p-3">
                      <Button size="sm" variant="secondary" onClick={() => toggleBloqueio(l)} disabled={busy}>
                        {l.bloqueado ? "Desbloquear" : "Bloquear"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!limites.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      Nenhum limite liberado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "conferir_nf" && (
        <ContaCoopFiscalNotesConferenciaPanel
          cnpj={cnpj}
          parceiros={parceiros}
          cooperadoNome={cooperadoNome}
          responsavelNome={user?.name ?? "Responsável"}
        />
      )}

      {tab === "liquidar" && (
        <ContaCoopLiquidacaoPanel
          cnpj={cnpj}
          cooperativaNome={cooperativaNome}
          parceiros={parceiros}
          cooperadoNome={cooperadoNome}
        />
      )}

      {tab === "estornos" && (
        <ContaCoopEstornosPanel cnpj={cnpj} parceiros={parceiros} cooperadoNome={cooperadoNome} />
      )}

      {tab === "descontos" && <ContaCoopDescontosPanel cnpj={cnpj} cooperadoNome={cooperadoNome} />}

      {tab === "mercados" && (
        <div className="space-y-4">
          <Card className="border-green-200 bg-green-50/50 !p-4">
            <h3 className="font-semibold text-gray-900">Desconto por contrato com cada mercado</h3>
            <p className="mt-1 text-sm text-gray-600">
              Informe o percentual de desconto acordado com o mercado parceiro. O cooperado paga o valor integral da
              compra; na liquidação o mercado recebe o líquido e a diferença retorna à cooperativa (aba Descontos).
              Use o reset de PIN quando o mercado esquecer a senha de estorno ou o PIN estiver bloqueado.
            </p>
          </Card>

          {parceiros.map((p) => {
            const descontoValor =
              discountDrafts[p.id] ??
              approveDiscountDrafts[p.id] ??
              (p.partnerDiscountPercent != null ? String(p.partnerDiscountPercent) : "");

            return (
              <Card key={p.id} className="space-y-4 !p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{p.nomeMercado}</p>
                    <p className="font-mono text-xs text-gray-500">{p.cnpjMercado}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      p.status === "ativo" && "bg-green-100 text-green-800",
                      p.status === "pendente" && "bg-amber-100 text-amber-800",
                      p.status === "bloqueado" && "bg-red-100 text-red-800"
                    )}
                  >
                    {statusMercadoLabel(p.status)}
                  </span>
                </div>

                <div className="rounded-xl border-2 border-green-300 bg-green-50/80 p-4">
                  <p className="text-sm font-medium text-green-900">Desconto contratual (%)</p>
                  <p className="mt-0.5 text-xs text-green-800">
                    {p.status === "pendente"
                      ? "Obrigatório ao aprovar o mercado — percentual que o estabelecimento concede nas vendas HB Créditos."
                      : "Percentual vigente neste contrato. Altere e clique em Salvar desconto."}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Input
                      inputMode="decimal"
                      placeholder="Ex: 5"
                      value={descontoValor}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (p.status === "pendente") {
                          setApproveDiscountDrafts((prev) => ({ ...prev, [p.id]: v }));
                        } else {
                          setDiscountDrafts((prev) => ({ ...prev, [p.id]: v }));
                        }
                      }}
                      className="max-w-xs bg-white text-lg font-semibold"
                    />
                    {p.status === "pendente" ? (
                      <Button
                        onClick={() =>
                          atualizarMercado(
                            p.id,
                            "ativo",
                            Number((descontoValor || "0").replace(",", "."))
                          )
                        }
                        disabled={busy || descontoValor.trim() === ""}
                      >
                        Aprovar mercado com este desconto
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => salvarDescontoMercado(p.id)} disabled={busy}>
                        Salvar desconto
                      </Button>
                    )}
                  </div>
                  {p.status === "ativo" && (p.partnerDiscountPercent ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-green-800">
                      Vigente no sistema: <strong>{p.partnerDiscountPercent}%</strong>
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-sm font-medium text-amber-950">PIN financeiro (estornos)</p>
                  <p className="mt-1 text-xs text-amber-900">
                    {p.hasFinancialPin
                      ? pinMercadoBloqueado(p)
                        ? "PIN bloqueado por tentativas incorretas — o mercado não consegue solicitar estornos."
                        : "PIN cadastrado pelo mercado para autorizar solicitações de estorno."
                      : "Mercado ainda não cadastrou PIN — estornos ficam indisponíveis até o cadastro."}
                  </p>
                  {(p.hasFinancialPin || pinMercadoBloqueado(p)) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => void resetarPinMercado(p)}
                      disabled={busy}
                    >
                      Resetar PIN de estorno
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {p.status === "ativo" && (
                    <Button size="sm" variant="secondary" onClick={() => atualizarMercado(p.id, "bloqueado")} disabled={busy}>
                      Bloquear mercado
                    </Button>
                  )}
                  {p.status === "bloqueado" && (
                    <Button size="sm" onClick={() => atualizarMercado(p.id, "ativo")} disabled={busy}>
                      Reativar mercado
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {!parceiros.length && (
            <Card className="!p-8 text-center text-sm text-gray-500">Nenhum mercado parceiro cadastrado.</Card>
          )}
        </div>
      )}
    </div>
  );
}
