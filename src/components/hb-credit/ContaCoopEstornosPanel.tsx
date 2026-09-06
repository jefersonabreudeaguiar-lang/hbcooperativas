"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopParceiro, ContaCoopSolicitacaoEstorno } from "@/modules/hb-credit/types";
import { fetchRefundRequests, postRefundRequestAction } from "@/services/creditApiService";
import { formatDateTime } from "@/utils/format";

interface ContaCoopEstornosPanelProps {
  cnpj: string;
  parceiros: ContaCoopParceiro[];
  cooperadoNome: (id: string) => string;
}

function labelSolicitacao(status: ContaCoopSolicitacaoEstorno["status"]): string {
  if (status === "pendente") return "Aguardando cooperativa";
  if (status === "aprovado") return "Aprovado";
  if (status === "negado") return "Negado";
  return "Cancelado";
}

export function ContaCoopEstornosPanel({ cnpj, parceiros, cooperadoNome }: ContaCoopEstornosPanelProps) {
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<ContaCoopSolicitacaoEstorno[]>([]);
  const [filtroCooperado, setFiltroCooperado] = useState("");
  const [filtroMercado, setFiltroMercado] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const cooperadosUnicos = useMemo(() => {
    const ids = [...new Set(solicitacoesPendentes.map((s) => s.cooperadoId).filter(Boolean))];
    return ids.sort((a, b) => cooperadoNome(a).localeCompare(cooperadoNome(b)));
  }, [solicitacoesPendentes, cooperadoNome]);

  const solicitacoesFiltradas = useMemo(() => {
    return solicitacoesPendentes.filter((s) => {
      if (filtroCooperado && s.cooperadoId !== filtroCooperado) return false;
      if (filtroMercado && s.parceiroId !== filtroMercado) return false;
      return true;
    });
  }, [solicitacoesPendentes, filtroCooperado, filtroMercado]);

  const carregar = useCallback(async () => {
    if (!cnpj) return;
    setLoading(true);
    setError("");
    try {
      const pendentes = await fetchRefundRequests(cnpj, "pendente");
      setSolicitacoesPendentes(pendentes);
    } catch (e) {
      setSolicitacoesPendentes([]);
      setError(e instanceof Error ? e.message : "Erro ao carregar solicitações.");
    } finally {
      setLoading(false);
    }
  }, [cnpj]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aprovarSolicitacao = async (solicitacao: ContaCoopSolicitacaoEstorno) => {
    const nome = cooperadoNome(solicitacao.cooperadoId);
    const msg =
      `Aprovar estorno solicitado pelo mercado ${solicitacao.parceiroNome}?\n\n` +
      `${formatCentsBRL(solicitacao.amountCents)} · cooperado ${nome}\n` +
      `Motivo: ${solicitacao.motivo}`;
    if (!window.confirm(msg)) return;

    setBusyId(solicitacao.id);
    setError("");
    setSuccess("");
    try {
      const res = await postRefundRequestAction({
        action: "approve",
        cnpj,
        requestId: solicitacao.id,
      });
      setSuccess(
        `Estorno aprovado. Limite disponível após estorno: ${formatCentsBRL(res.disponivelAposCents ?? 0)}.`
      );
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível aprovar.");
    } finally {
      setBusyId("");
    }
  };

  const negarSolicitacao = async (solicitacao: ContaCoopSolicitacaoEstorno) => {
    const note = window.prompt("Motivo da negativa (opcional):") ?? "";
    setBusyId(solicitacao.id);
    setError("");
    setSuccess("");
    try {
      await postRefundRequestAction({
        action: "deny",
        cnpj,
        requestId: solicitacao.id,
        reviewNote: note.trim() || undefined,
      });
      setSuccess("Solicitação de estorno negada.");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível negar.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 !p-5">
        <div>
          <h3 className="font-semibold text-gray-900">Estornos HB Créditos</h3>
          <p className="mt-1 text-sm text-gray-600">
            Estornos só podem ser iniciados pelo mercado parceiro. A cooperativa analisa, aprova ou nega cada
            solicitação recebida.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Cooperado</Label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={filtroCooperado}
              onChange={(e) => setFiltroCooperado(e.target.value)}
            >
              <option value="">Todos</option>
              {cooperadosUnicos.map((id) => (
                <option key={id} value={id}>
                  {cooperadoNome(id)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Mercado</Label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={filtroMercado}
              onChange={(e) => setFiltroMercado(e.target.value)}
            >
              <option value="">Todos</option>
              {parceiros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeMercado}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={() => void carregar()} disabled={loading}>
              Atualizar lista
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="!p-8 text-center text-sm text-gray-500">Carregando solicitações...</Card>
      ) : !solicitacoesFiltradas.length ? (
        <Card className="!p-8 text-center text-sm text-gray-500">
          {solicitacoesPendentes.length
            ? "Nenhuma solicitação pendente com os filtros selecionados."
            : "Nenhuma solicitação de estorno pendente. O mercado precisa solicitar o estorno no painel dele."}
        </Card>
      ) : (
        <Card className="space-y-3 !p-5 border-amber-200 bg-amber-50/40">
          <div>
            <h3 className="font-semibold text-gray-900">Solicitações pendentes do mercado</h3>
            <p className="text-sm text-gray-600">{solicitacoesFiltradas.length} aguardando sua análise</p>
          </div>
          {solicitacoesFiltradas.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-gray-900">{formatCentsBRL(s.amountCents)}</p>
                <p>
                  <span className="text-gray-500">Mercado:</span> {s.parceiroNome}
                </p>
                <p>
                  <span className="text-gray-500">Cooperado:</span> {cooperadoNome(s.cooperadoId)}
                </p>
                {s.receiptCode && (
                  <p>
                    <span className="text-gray-500">Recibo:</span> {s.receiptCode}
                  </p>
                )}
                <p>
                  <span className="text-gray-500">Motivo:</span> {s.motivo}
                </p>
                <p>
                  <span className="text-gray-500">Solicitado em:</span> {formatDateTime(s.createdAt)}
                </p>
                <p className="text-xs text-amber-800">{labelSolicitacao(s.status)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={Boolean(busyId)} onClick={() => void aprovarSolicitacao(s)}>
                  {busyId === s.id ? "Processando..." : "Aprovar estorno"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(busyId)}
                  onClick={() => void negarSolicitacao(s)}
                >
                  Negar
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="space-y-3">
        {error && <AlertBanner variant="error">{error}</AlertBanner>}
        {success && (
          <AlertBanner variant="info" title="Concluído">
            {success}
          </AlertBanner>
        )}
      </div>
    </div>
  );
}
