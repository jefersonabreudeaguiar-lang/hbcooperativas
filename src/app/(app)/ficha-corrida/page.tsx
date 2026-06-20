"use client";

import { useMemo, useState } from "react";
import { QrCode, XCircle, Wallet, CheckCircle2 } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getTotalAPagarCooperado, marcarFichaComoPaga } from "@/services/notaPedidoService";
import { PageHeader, DataTable, FilterBar } from "@/components/ui/Table";
import { Select, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { ConfirmDialog, PromptDialog } from "@/components/ui/ConfirmDialog";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";

export default function FichaCorridaPage() {
  const data = useAppData();
  const { user, isCooperado, cooperadoId, check } = usePermissions();
  const [mesFilter, setMesFilter] = useState(getCurrentMesReferencia());
  const [cooperadoFilter, setCooperadoFilter] = useState("");
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [confirmPagamento, setConfirmPagamento] = useState(false);
  const [pixInvalidoOpen, setPixInvalidoOpen] = useState(false);
  const [motivoPix, setMotivoPix] = useState("");
  const [pagoMsg, setPagoMsg] = useState("");

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    const set = new Set(data.fichaCorrida.map((f) => f.mesReferencia));
    set.add(getCurrentMesReferencia());
    return [...set].sort().reverse();
  }, [data]);

  const cooperados = useMemo(() => {
    if (!data || !coopId) return [];
    return data.cooperados.filter((c) => c.cooperativaId === coopId && c.status === "ativo");
  }, [data, coopId]);

  const cooperadoSelecionado = useMemo(() => {
    if (!data) return undefined;
    const id = isCooperado ? cooperadoId : cooperadoFilter;
    return id ? data.cooperados.find((c) => c.id === id) : undefined;
  }, [data, isCooperado, cooperadoId, cooperadoFilter]);

  const lancamentos = useMemo(() => {
    if (!data) return [];
    return data.fichaCorrida
      .filter((f) => {
        if (coopId && f.cooperativaId !== coopId) return false;
        if (isCooperado && cooperadoId && f.cooperadoId !== cooperadoId) return false;
        if (cooperadoFilter && f.cooperadoId !== cooperadoFilter) return false;
        if (mesFilter && f.mesReferencia !== mesFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [data, coopId, isCooperado, cooperadoId, cooperadoFilter, mesFilter]);

  const totalPendente = useMemo(() => {
    if (!data) return 0;
    const cid = isCooperado ? cooperadoId : cooperadoFilter || undefined;
    if (cid) return getTotalAPagarCooperado(data, cid, mesFilter);
    return lancamentos.filter((f) => f.status === "pendente").reduce((s, f) => s + f.valorLiquido, 0);
  }, [data, lancamentos, isCooperado, cooperadoId, cooperadoFilter, mesFilter]);

  const handlePixInvalido = () => {
    if (!cooperadoSelecionado || !user || !motivoPix.trim()) return;
    updateData((d) => {
      const updated = {
        ...d,
        cooperados: d.cooperados.map((c) =>
          c.id === cooperadoSelecionado.id
            ? { ...c, pixValido: false, pixInvalidoMotivo: motivoPix.trim(), updatedAt: new Date().toISOString() }
            : c
        ),
      };
      return addAuditEntry(updated, {
        entityType: "cooperado", entityId: cooperadoSelecionado.id, action: "editar",
        userId: user.id, userName: user.name, changes: `PIX inválido: ${motivoPix.trim()}`,
      });
    });
    setPixInvalidoOpen(false);
    setMotivoPix("");
  };

  const handleConfirmarPagamento = () => {
    if (!cooperadoSelecionado || !user || totalPendente <= 0) return;
    updateData((d) =>
      addAuditEntry(marcarFichaComoPaga(d, cooperadoSelecionado.id, mesFilter, user.name), {
        entityType: "ficha_corrida", entityId: cooperadoSelecionado.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: `Pagamento: ${formatCurrency(totalPendente)}`,
      })
    );
    setConfirmPagamento(false);
    setPagoMsg(`Pagamento de ${formatCurrency(totalPendente)} registrado para ${cooperadoSelecionado.nomeCompleto}.`);
  };

  if (!data) return null;

  const pixOk = cooperadoSelecionado && !cooperadoPrecisaCadastrarPix(cooperadoSelecionado.chavePix, cooperadoSelecionado.pixValido);

  return (
    <div>
      <PageHeader
        title={isCooperado ? "Quanto vou receber" : "Pagar cooperados"}
        subtitle={isCooperado ? "Valores das entregas já conferidas pela cooperativa" : "Gere o PIX e registre o pagamento de cada cooperado"}
      />

      {pagoMsg && <AlertBanner variant="success" className="mb-4" onDismiss={() => setPagoMsg("")}>{pagoMsg}</AlertBanner>}

      <div className="bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 mb-6 shadow-sm">
        <p className="text-green-100 text-sm">{isCooperado ? "Total a receber" : "Valor a pagar"} · {formatMesReferencia(mesFilter)}</p>
        <p className="text-4xl font-bold mt-2">{formatCurrency(totalPendente)}</p>
        {isCooperado && totalPendente === 0 && (
          <p className="text-green-100 text-sm mt-3">Quando a cooperativa aprovar suas entregas, o valor aparece aqui.</p>
        )}
      </div>

      <FilterBar>
        {!isCooperado && (
          <FormField label="Cooperado">
            <Select value={cooperadoFilter} onChange={(e) => setCooperadoFilter(e.target.value)} className="min-w-[220px]">
              <option value="">Escolha o cooperado...</option>
              {cooperados.map((c) => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Mês">
          <Select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)} className="min-w-[180px]">
            {meses.map((m) => <option key={m} value={m}>{formatMesReferencia(m)}</option>)}
          </Select>
        </FormField>
      </FilterBar>

      {!isCooperado && cooperadoSelecionado && (
        <Card title={`Pagamento — ${cooperadoSelecionado.nomeCompleto.split(" ")[0]}`} className="mb-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Wallet size={18} className="text-gray-500" />
              <span>Chave PIX:</span>
              {cooperadoSelecionado.chavePix ? (
                <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">{cooperadoSelecionado.chavePix}</code>
              ) : (
                <span className="text-red-600 font-medium">Não cadastrada — peça ao cooperado</span>
              )}
            </div>
            {cooperadoSelecionado.pixValido === false && (
              <AlertBanner variant="error">Chave PIX com problema. O cooperado foi avisado para corrigir.</AlertBanner>
            )}
            {check("ficha_corrida", "edit") && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => setPixModalOpen(true)} disabled={!pixOk || totalPendente <= 0}>
                  <QrCode size={18} /> Gerar QR Code PIX
                </Button>
                <Button variant="secondary" onClick={() => { setMotivoPix("Chave PIX não encontrada ou incorreta."); setPixInvalidoOpen(true); }}>
                  <XCircle size={18} /> Chave PIX com problema
                </Button>
                <Button variant="gold" onClick={() => setConfirmPagamento(true)} disabled={totalPendente <= 0}>
                  <CheckCircle2 size={18} /> Já paguei — registrar
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Histórico de entregas aprovadas">
        <DataTable
          data={lancamentos}
          keyField="id"
          emptyMessage="Nenhum valor lançado ainda."
          mobileCard={(f) => (
            <div className="bg-white border rounded-xl p-4">
              <p className="font-medium text-sm">{f.descricao}</p>
              <p className="text-xs text-gray-500 mt-1">{formatDate(f.dataLancamento)}</p>
              <p className="text-lg font-bold text-green-700 mt-2">{formatCurrency(f.valorLiquido)}</p>
              <span className="text-xs text-gray-500">{f.status === "pago" ? "Pago" : "Aguardando pagamento"}</span>
            </div>
          )}
          columns={[
            { key: "data", label: "Data", render: (f) => formatDate(f.dataLancamento) },
            ...(!isCooperado ? [{ key: "coop", label: "Cooperado", render: (f: (typeof lancamentos)[0]) => getCooperadoNome(data.cooperados, f.cooperadoId) }] : []),
            { key: "descricao", label: "Entrega" },
            { key: "valor", label: "Valor a receber", render: (f) => formatCurrency(f.valorLiquido) },
            { key: "status", label: "Situação", render: (f) => (f.status === "pago" ? "Pago" : "Aguardando") },
          ]}
        />
      </Card>

      {cooperadoSelecionado && pixOk && (
        <PixQrModal open={pixModalOpen} onClose={() => setPixModalOpen(false)} chavePix={cooperadoSelecionado.chavePix} nome={cooperadoSelecionado.nomeCompleto} valor={totalPendente} />
      )}

      <ConfirmDialog
        open={confirmPagamento}
        onClose={() => setConfirmPagamento(false)}
        onConfirm={handleConfirmarPagamento}
        title="Confirmar pagamento"
        message={`Registrar pagamento de ${formatCurrency(totalPendente)} para ${cooperadoSelecionado?.nomeCompleto}?`}
        confirmLabel="Sim, já paguei"
      />

      <PromptDialog
        open={pixInvalidoOpen}
        onClose={() => setPixInvalidoOpen(false)}
        title="Chave PIX com problema"
        label="O que o cooperado precisa corrigir?"
        confirmLabel="Avisar cooperado"
        suggestions={["Chave PIX não encontrada", "Chave pertence a outra pessoa", "CPF incorreto na chave"]}
        value={motivoPix}
        onChange={setMotivoPix}
        onConfirm={handlePixInvalido}
      />
    </div>
  );
}
