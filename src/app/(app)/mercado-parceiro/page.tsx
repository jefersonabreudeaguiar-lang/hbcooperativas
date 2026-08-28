"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { PageHeader } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  cancelCreditIntent,
  createCreditIntent,
  fetchMercadoParceiroData,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopIntent, ContaCoopParceiro } from "@/modules/hb-credit/types";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function MercadoParceiroPage() {
  return (
    <CreditFeatureGate>
      <MercadoParceiroContent />
    </CreditFeatureGate>
  );
}

function MercadoParceiroContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parceiro, setParceiro] = useState<ContaCoopParceiro | null>(null);
  const [intents, setIntents] = useState<ContaCoopIntent[]>([]);
  const [recebiveis, setRecebiveis] = useState<{ id: string; amountCents: number; status: string; createdAt: string }[]>([]);
  const [valorReais, setValorReais] = useState("");
  const [descricao, setDescricao] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchMercadoParceiroData();
      setParceiro(data.parceiro ?? null);
      setIntents(data.intents ?? []);
      setRecebiveis(data.recebiveis ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const criarCobranca = async () => {
    setBusy(true);
    setError("");
    setQrUrl("");
    setQrPayload("");
    try {
      const amount = Number(valorReais.replace(",", "."));
      const res = await createCreditIntent(amount, descricao.trim() || undefined);
      if (res.qrPayload) {
        setQrPayload(res.qrPayload);
        const url = await QRCode.toDataURL(res.qrPayload, { width: 260, margin: 2 });
        setQrUrl(url);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar cobrança.");
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async (intentId: string) => {
    setBusy(true);
    try {
      await cancelCreditIntent(intentId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !parceiro) return <PageSkeleton />;

  const ativo = parceiro?.status === "ativo";
  const pendente = parceiro?.status === "pendente";

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={parceiro?.nomeMercado ?? "Mercado parceiro"}
        subtitle="Cobrança Conta Coop — QR referencia intent + nonce (sem autoridade própria)"
      />

      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      {pendente && (
        <AlertBanner variant="warning" title="Aguardando aprovação">
          O responsável da cooperativa precisa aprovar este mercado antes de criar cobranças.
        </AlertBanner>
      )}

      {parceiro?.status === "bloqueado" && (
        <AlertBanner variant="error" title="Mercado bloqueado">
          Novas cobranças estão suspensas. Histórico anterior permanece intacto.
        </AlertBanner>
      )}

      <Card className="p-5 space-y-3">
        <p className="text-sm text-gray-600">Status: <strong className="capitalize">{parceiro?.status}</strong></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Valor (R$)</Label>
            <Input value={valorReais} onChange={(e) => setValorReais(e.target.value)} disabled={!ativo} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!ativo} />
          </div>
        </div>
        <Button onClick={criarCobranca} disabled={busy || !ativo}>
          Nova cobrança
        </Button>
        {qrUrl && (
          <div className="flex flex-col items-center gap-2 pt-4 border-t">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR cobrança" className="rounded-lg border" />
            <p className="text-xs text-gray-500 break-all text-center max-w-sm">{qrPayload}</p>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Cobranças recentes</h3>
        {intents.map((intent) => (
          <div key={intent.id} className="flex items-center justify-between border-b py-2 text-sm">
            <div>
              <p className="font-medium">{formatCentsBRL(intent.amountCents)} · {intent.status}</p>
              <p className="text-xs text-gray-500">{new Date(intent.createdAt).toLocaleString("pt-BR")}</p>
            </div>
            {["pendente", "criada"].includes(intent.status) && (
              <Button size="sm" variant="secondary" onClick={() => cancelar(intent.id)} disabled={busy}>
                Cancelar
              </Button>
            )}
          </div>
        ))}
        {!intents.length && <p className="text-sm text-gray-500">Nenhuma cobrança.</p>}
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Recebíveis</h3>
        {recebiveis.map((r) => (
          <div key={r.id} className="flex justify-between text-sm border-b py-2">
            <span>{formatCentsBRL(r.amountCents)}</span>
            <span className="capitalize text-gray-600">{r.status}</span>
          </div>
        ))}
        {!recebiveis.length && <p className="text-sm text-gray-500">Nenhum recebível ainda.</p>}
      </Card>
    </div>
  );
}
