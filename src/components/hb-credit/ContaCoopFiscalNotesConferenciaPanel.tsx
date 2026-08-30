"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { ContaCoopFiscalNote, ContaCoopFiscalNotesResumo, ContaCoopParceiro } from "@/modules/hb-credit/types";
import {
  conferirFiscalNote,
  fetchFiscalNotePhotoUrl,
  fetchStaffFiscalNotes,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";

interface ContaCoopFiscalNotesConferenciaPanelProps {
  cnpj: string;
  parceiros: ContaCoopParceiro[];
  cooperadoNome: (id: string) => string;
  responsavelNome: string;
}

function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parseReaisInput(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function ContaCoopFiscalNotesConferenciaPanel({
  cnpj,
  parceiros,
  cooperadoNome,
  responsavelNome,
}: ContaCoopFiscalNotesConferenciaPanelProps) {
  const [mesReferencia, setMesReferencia] = useState(getCurrentMesReferencia());
  const [partnerId, setPartnerId] = useState("");
  const [notas, setNotas] = useState<ContaCoopFiscalNote[]>([]);
  const [resumo, setResumo] = useState<ContaCoopFiscalNotesResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ContaCoopFiscalNote | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [nfNumber, setNfNumber] = useState("");
  const [nfIssuedToName, setNfIssuedToName] = useState("");
  const [nfDate, setNfDate] = useState("");
  const [nfAmountReais, setNfAmountReais] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const fila = useMemo(
    () => notas.filter((n) => n.status === "aguardando_conferencia"),
    [notas]
  );

  const reload = useCallback(async () => {
    if (!cnpj) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchStaffFiscalNotes({
        cnpj,
        mesReferencia,
        partnerId: partnerId || undefined,
      });
      setNotas(data.notas);
      setResumo(data.resumo);
    } catch (e) {
      setNotas([]);
      setResumo(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar NFs.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, mesReferencia, partnerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const abrirConferencia = async (nota: ContaCoopFiscalNote) => {
    setSelected(nota);
    setPhotoUrl(null);
    setNfNumber(nota.nfNumber ?? "");
    setNfIssuedToName(nota.nfIssuedToName ?? nota.cooperadoNome ?? cooperadoNome(nota.cooperadoId));
    setNfDate(nota.nfDate ?? new Date(nota.createdAt).toISOString().slice(0, 10));
    setNfAmountReais(centsToReaisInput(nota.saleAmountCents));
    setRejectReason("");
    setError("");
    try {
      const data = await fetchFiscalNotePhotoUrl(cnpj, nota.transactionId);
      setPhotoUrl(data.photoUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar foto.");
    }
  };

  const fecharModal = () => {
    setSelected(null);
    setPhotoUrl(null);
  };

  const aprovar = async () => {
    if (!selected) return;
    const valor = parseReaisInput(nfAmountReais);
    if (!nfNumber.trim() || !nfIssuedToName.trim() || !nfDate || !Number.isFinite(valor)) {
      setError("Preencha número, nome, data e valor da NF.");
      return;
    }
    if (Math.round(valor * 100) !== selected.saleAmountCents) {
      setError(`Valor da NF deve ser ${formatCentsBRL(selected.saleAmountCents)} (igual à venda).`);
      return;
    }

    setBusy(true);
    setError("");
    try {
      await conferirFiscalNote({
        cnpj,
        transactionId: selected.transactionId,
        action: "approve",
        nfNumber,
        nfIssuedToName,
        nfDate,
        nfAmountReais: valor,
        responsavelNome,
      });
      setSuccess("NF conferida. Valor liberado para liquidação.");
      fecharModal();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao conferir.");
    } finally {
      setBusy(false);
    }
  };

  const pedirCorrecao = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await conferirFiscalNote({
        cnpj,
        transactionId: selected.transactionId,
        action: "reject",
        reason: rejectReason.trim() || "Corrija a nota fiscal e reenvie.",
        responsavelNome,
      });
      setSuccess("Correção solicitada ao mercado.");
      fecharModal();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao pedir correção.");
    } finally {
      setBusy(false);
    }
  };

  const valoresBatem =
    resumo != null &&
    resumo.totalVendasCents > 0 &&
    resumo.totalConferidasCents === resumo.totalVendasCents &&
    resumo.pendentesAnexo === 0 &&
    resumo.aguardandoConferencia === 0 &&
    resumo.correcaoPedida === 0;

  return (
    <div className="space-y-4">
      {error && !selected && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="info" title="OK">{success}</AlertBanner>}

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label>Mês</Label>
            <input
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[200px]">
            <Label>Mercado</Label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {parceiros.filter((p) => p.status === "ativo").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeMercado}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={() => void reload()} disabled={loading}>
            Atualizar
          </Button>
        </div>

        {resumo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-500 text-xs">Vendas no app</p>
              <p className="font-bold text-gray-900">{formatCentsBRL(resumo.totalVendasCents)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-500 text-xs">NFs conferidas</p>
              <p className="font-bold text-green-800">{formatCentsBRL(resumo.totalConferidasCents)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-500 text-xs">Pendentes anexo</p>
              <p className="font-bold text-amber-800">{resumo.pendentesAnexo}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-500 text-xs">Aguardando conferência</p>
              <p className="font-bold text-blue-800">{resumo.aguardandoConferencia}</p>
            </div>
          </div>
        )}

        {valoresBatem && (
          <AlertBanner variant="info" title="Pagamento aprovado por NFs">
            Todas as vendas do mês têm NF conferida com valores batendo. Pode liquidar na aba Liquidar.
          </AlertBanner>
        )}

        {resumo && resumo.pendentesAnexo + resumo.aguardandoConferencia + resumo.correcaoPedida > 0 && (
          <AlertBanner variant="warning" title="Notas pendentes">
            Mercado ainda precisa anexar ou corrigir NFs antes do pagamento total.
          </AlertBanner>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <FileText size={18} className="text-green-700" />
          Fila de conferência · {formatMesReferencia(mesReferencia)}
        </h3>

        {loading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : fila.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma NF aguardando conferência.</p>
        ) : (
          <ul className="space-y-2">
            {fila.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-3 last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {cooperadoNome(n.cooperadoId)} · {formatCentsBRL(n.saleAmountCents)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(n.createdAt).toLocaleString("pt-BR")}
                    {n.receiptCode ? ` · ${n.receiptCode}` : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => void abrirConferencia(n)}>
                  Conferir NF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Conferir nota fiscal</h3>
                <p className="text-sm text-gray-600">
                  {cooperadoNome(selected.cooperadoId)} · Venda {formatCentsBRL(selected.saleAmountCents)}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={fecharModal}>
                Fechar
              </Button>
            </div>

            {error && <AlertBanner variant="error">{error}</AlertBanner>}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-gray-50 min-h-[240px] flex items-center justify-center overflow-hidden">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Nota fiscal" className="max-h-[360px] w-full object-contain" />
                ) : (
                  <p className="text-sm text-gray-500 p-4 text-center">Carregando foto…</p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-gray-500">Dados da NF (preencha na conferência)</p>
                <div>
                  <Label>Nome / razão na NF</Label>
                  <Input value={nfIssuedToName} onChange={(e) => setNfIssuedToName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Número da NF</Label>
                  <Input value={nfNumber} onChange={(e) => setNfNumber(e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data da NF</Label>
                    <Input type="date" value={nfDate} onChange={(e) => setNfDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input
                      value={nfAmountReais}
                      onChange={(e) => setNfAmountReais(e.target.value)}
                      className={cn(
                        "mt-1",
                        parseReaisInput(nfAmountReais) * 100 !== selected.saleAmountCents &&
                          nfAmountReais &&
                          "border-red-400"
                      )}
                    />
                    <p className="text-xs text-gray-500 mt-1">Deve ser {formatCentsBRL(selected.saleAmountCents)}</p>
                  </div>
                </div>
                <div>
                  <Label>Motivo (se pedir correção)</Label>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Opcional"
                    className="mt-1"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => void aprovar()} disabled={busy}>
                    <CheckCircle2 size={16} className="mr-1.5" />
                    Aprovar NF
                  </Button>
                  <Button variant="secondary" onClick={() => void pedirCorrecao()} disabled={busy}>
                    <XCircle size={16} className="mr-1.5" />
                    Pedir correção
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
