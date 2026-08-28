"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { PageHeader } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  authorizeCreditPayment,
  fetchCreditAccount,
  fetchCreditLedger,
  setCreditFinancialPin,
  validateCreditQr,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopIntent, ContaCoopLedgerEntry, ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { generateId } from "@/services/dataStore";

export default function MinhaContaCoopPage() {
  return (
    <CreditFeatureGate>
      <MinhaContaCoopContent />
    </CreditFeatureGate>
  );
}

function MinhaContaCoopContent() {
  const { user } = usePermissions();
  const data = useAppData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [account, setAccount] = useState<ContaCoopLimiteCooperado | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [ledger, setLedger] = useState<ContaCoopLedgerEntry[]>([]);
  const [pinSetup, setPinSetup] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [pendingIntent, setPendingIntent] = useState<{
    intent: ContaCoopIntent;
    parceiroNome: string;
    limite: ContaCoopLimiteCooperado;
  } | null>(null);
  const [payPin, setPayPin] = useState("");
  const [busy, setBusy] = useState(false);

  const cnpj = useMemo(() => {
    if (!user || !data) return "";
    if (user.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    return coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";
  }, [user, data]);
  const cooperadoId = user?.cooperadoId ?? "";

  const reload = useCallback(async () => {
    if (!cnpj || !cooperadoId) return;
    setLoading(true);
    setError("");
    try {
      const acc = await fetchCreditAccount(cnpj, cooperadoId);
      setAccount((acc.account as ContaCoopLimiteCooperado) ?? null);
      setUpdatedAt(acc.updatedAt ?? null);
      setHasPin(Boolean((acc as { hasPin?: boolean }).hasPin));
      const lg = await fetchCreditLedger(cnpj, cooperadoId);
      setLedger(lg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar conta.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, cooperadoId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const salvarPin = async () => {
    if (!cnpj || !cooperadoId) return;
    setBusy(true);
    setError("");
    try {
      await setCreditFinancialPin(cnpj, cooperadoId, pinSetup);
      setHasPin(true);
      setPinSetup("");
      setSuccess("PIN financeiro cadastrado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar PIN.");
    } finally {
      setBusy(false);
    }
  };

  const validarQr = async () => {
    if (!cnpj || !cooperadoId || !qrInput.trim()) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await validateCreditQr(cnpj, cooperadoId, qrInput.trim());
      if (res.intent && res.limite && res.parceiroNome) {
        setPendingIntent({ intent: res.intent, limite: res.limite, parceiroNome: res.parceiroNome });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Código inválido.");
      setPendingIntent(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmarPagamento = async () => {
    if (!pendingIntent || !cnpj || !cooperadoId) return;
    setBusy(true);
    setError("");
    try {
      const res = await authorizeCreditPayment({
        cnpj,
        cooperadoId,
        intentId: pendingIntent.intent.id,
        nonce: pendingIntent.intent.nonce,
        pin: payPin,
        idempotencyKey: generateId("idem"),
      });
      setSuccess(`Pagamento confirmado. Comprovante: ${res.receiptCode}`);
      setPendingIntent(null);
      setQrInput("");
      setPayPin("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pagamento recusado.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !account) return <PageSkeleton />;

  const disponivel = account?.valorDisponivelCents ?? 0;
  const limite = account?.limiteLiberadoCents ?? 0;
  const usado = account?.valorUsadoCents ?? 0;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <PageHeader title="Conta Coop" subtitle="Saldo e pagamentos — decisão sempre no servidor" />

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="info" title="OK">{success}</AlertBanner>}
      {account?.bloqueado && (
        <AlertBanner variant="warning" title="Conta bloqueada">
          Novos pagamentos estão suspensos. Fale com a cooperativa.
        </AlertBanner>
      )}

      <Card className="p-5 space-y-3 bg-gradient-to-br from-green-50 to-white border-green-200">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Disponível agora</p>
        <p className="text-3xl font-bold text-green-900">{formatCentsBRL(disponivel)}</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 pt-2">
          <div>Limite: {formatCentsBRL(limite)}</div>
          <div>Usado: {formatCentsBRL(usado)}</div>
        </div>
        {updatedAt && (
          <p className="text-xs text-gray-400">Atualizado: {new Date(updatedAt).toLocaleString("pt-BR")}</p>
        )}
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">
          Sem servidor = sem novo pagamento. Offline mostra apenas o último saldo conhecido.
        </p>
      </Card>

      {!hasPin && (
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold">PIN financeiro</h3>
          <p className="text-sm text-gray-600">Cadastre um PIN numérico para autorizar pagamentos.</p>
          <Label>PIN ({FINANCIAL_PIN_MIN_LENGTH}+ dígitos)</Label>
          <Input
            type="password"
            inputMode="numeric"
            value={pinSetup}
            onChange={(e) => setPinSetup(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
          />
          <Button onClick={salvarPin} disabled={busy || pinSetup.length < FINANCIAL_PIN_MIN_LENGTH}>
            Salvar PIN
          </Button>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">Pagar no mercado</h3>
        <Label>Cole o código QR ou hb-credit://</Label>
        <Input value={qrInput} onChange={(e) => setQrInput(e.target.value)} placeholder="hb-credit://pay/..." />
        <Button onClick={validarQr} disabled={busy || !hasPin || account?.bloqueado}>
          Verificar cobrança
        </Button>
      </Card>

      {pendingIntent && (
        <Card className="p-5 space-y-3 border-green-300 bg-green-50/50">
          <p className="font-semibold text-lg">{pendingIntent.parceiroNome}</p>
          <p className="text-2xl font-bold">{formatCentsBRL(pendingIntent.intent.amountCents)}</p>
          <p className="text-sm text-gray-600">
            Disponível antes: {formatCentsBRL(pendingIntent.limite.valorDisponivelCents)}
          </p>
          <p className="text-sm font-medium text-green-800">
            Disponível depois:{" "}
            {formatCentsBRL(pendingIntent.limite.valorDisponivelCents - pendingIntent.intent.amountCents)}
          </p>
          <Label>PIN financeiro</Label>
          <Input
            type="password"
            inputMode="numeric"
            value={payPin}
            onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))}
          />
          <Button onClick={confirmarPagamento} disabled={busy || payPin.length < FINANCIAL_PIN_MIN_LENGTH}>
            Confirmar pagamento
          </Button>
        </Card>
      )}

      <Card className="p-5 space-y-2">
        <h3 className="font-semibold">Extrato</h3>
        {ledger.map((entry) => (
          <div key={entry.id} className="flex justify-between text-sm border-b py-2">
            <div>
              <p className="font-medium">{entry.tipo}</p>
              <p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
            </div>
            <p className={entry.amountCents < 0 ? "text-red-700" : "text-green-700"}>
              {formatCentsBRL(entry.amountCents)}
            </p>
          </div>
        ))}
        {!ledger.length && <p className="text-sm text-gray-500">Nenhum movimento ainda.</p>}
      </Card>
    </div>
  );
}
