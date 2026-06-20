"use client";

import { useState, useMemo, useEffect } from "react";
import { QrCode, Copy, CheckCircle2, Info, AlertCircle } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { formatCnpj } from "@/utils/cooperativa";
import { PageHeader, DataTable, FilterBar } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud, syncAllCooperativaFromCloud } from "@/services/cooperativaSyncCloudService";
import {
  getChavePixMensalidadeCooperativa,
  cooperadoInformouPagamentoMensalidade,
  confirmarPagamentoMensalidade,
  mensalidadePodePagarComPix,
  mensalidadeAguardandoConfirmacao,
} from "@/services/mensalidadeService";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Mensalidade } from "@/types";

const INFO_COOPERADO =
  "As mensalidades são geradas automaticamente todo mês. Pague via PIX para o CNPJ da cooperativa. Depois toque em Paguei — a mensalidade só aparece como paga após a diretoria confirmar no extrato bancário.";

const INFO_RESPONSAVEL =
  "Configure valor e dia de vencimento em Perfil da cooperativa. Todo mês o sistema gera a cobrança para cada cooperado ativo. Quando o cooperado informar que pagou, confira o PIX recebido e confirme aqui.";

export default function MensalidadesPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("");
  const [mesFilter, setMesFilter] = useState(getCurrentMesReferencia());
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [mensalidadePix, setMensalidadePix] = useState<Mensalidade | null>(null);
  const [copiedCnpj, setCopiedCnpj] = useState(false);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const cooperativa = coopId ? data?.cooperativas.find((c) => c.id === coopId) : undefined;
  const chavePixCoop = coopId && data ? getChavePixMensalidadeCooperativa(data, coopId) : null;

  useEffect(() => {
    if (!data || !coopId || !user) return;
    void (async () => {
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (cnpj) await syncAllCooperativaFromCloud(cnpj);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coopId, user?.id]);

  const pushOperacional = () => {
    void (async () => {
      if (!user || !coopId) return;
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
  };

  const mensalidades = useMemo(() => {
    if (!data) return [];
    return data.mensalidades
      .filter((m) => {
        const c = data.cooperados.find((x) => x.id === m.cooperadoId);
        if (coopId && c?.cooperativaId !== coopId) return false;
        if (isCooperado && cooperadoId && m.cooperadoId !== cooperadoId) return false;
        if (statusFilter && m.status !== statusFilter) return false;
        if (mesFilter && m.mesReferencia !== mesFilter) return false;
        return true;
      })
      .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia) || a.vencimento.localeCompare(b.vencimento));
  }, [data, statusFilter, mesFilter, isCooperado, cooperadoId, coopId]);

  const aguardandoConfirmacao = useMemo(
    () => mensalidades.filter((m) => m.status === "aguardando_confirmacao"),
    [mensalidades]
  );

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    const set = new Set(data.mensalidades.map((m) => m.mesReferencia));
    set.add(getCurrentMesReferencia());
    return [...set].sort().reverse();
  }, [data]);

  const resumoCooperado = useMemo(() => {
    if (!isCooperado) return null;
    return {
      pagas: mensalidades.filter((m) => m.status === "paga").length,
      vencidas: mensalidades.filter((m) => m.status === "atrasada").length,
      pendentes: mensalidades.filter((m) => m.status === "pendente").length,
      aguardando: mensalidades.filter((m) => m.status === "aguardando_confirmacao").length,
    };
  }, [mensalidades, isCooperado]);

  const abrirPix = (m: Mensalidade) => {
    setMensalidadePix(m);
    setPixModalOpen(true);
  };

  const copiarCnpjPix = async () => {
    if (!chavePixCoop) return;
    await navigator.clipboard.writeText(chavePixCoop);
    setCopiedCnpj(true);
    setTimeout(() => setCopiedCnpj(false), 2000);
  };

  const handlePaguei = (m: Mensalidade) => {
    if (!user) return;
    updateData((d) => {
      const next = cooperadoInformouPagamentoMensalidade(d, m.id);
      if (!next) return d;
      return addAuditEntry(next, {
        entityType: "mensalidade",
        entityId: m.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Cooperado informou pagamento via PIX",
      });
    });
    pushOperacional();
  };

  const handleConfirmar = (m: Mensalidade) => {
    if (!user) return;
    updateData((d) => {
      const next = confirmarPagamentoMensalidade(d, m.id, user.name);
      if (!next) return d;
      return addAuditEntry(next, {
        entityType: "mensalidade",
        entityId: m.id,
        action: "aprovar",
        userId: user.id,
        userName: user.name,
        changes: "Pagamento PIX confirmado",
      });
    });
    pushOperacional();
  };

  if (!data) return null;

  const cfgOk = cooperativa?.mensalidadeConfig?.gerarAutomaticamente && (cooperativa.mensalidadeConfig.valorPadrao ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Mensalidades"
        subtitle={isCooperado ? "Suas cobranças mensais da cooperativa" : "Cobranças geradas automaticamente para os cooperados"}
      />

      <AlertBanner variant="info" className="mb-6">
        <Info size={18} className="inline mr-1 shrink-0" />
        {isCooperado ? INFO_COOPERADO : INFO_RESPONSAVEL}
      </AlertBanner>

      {!isCooperado && !cfgOk && (
        <AlertBanner variant="warning" title="Geração automática não configurada" className="mb-6">
          Em <strong>Perfil da cooperativa</strong>, informe o valor, o dia de vencimento e marque{" "}
          <strong>Gerar mensalidades automaticamente</strong>.
        </AlertBanner>
      )}

      {isCooperado && chavePixCoop && cooperativa && (
        <Card className="mb-6 border-green-200 bg-green-50/40">
          <p className="text-sm font-medium text-gray-900">PIX da cooperativa (CNPJ)</p>
          <p className="text-xs text-gray-600 mt-1">Use esta chave para pagar qualquer mensalidade</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="bg-white px-3 py-2 rounded-lg text-sm border">{formatCnpj(chavePixCoop)}</code>
            <Button variant="secondary" size="sm" onClick={copiarCnpjPix}>
              <Copy size={16} /> {copiedCnpj ? "Copiado!" : "Copiar PIX (CNPJ)"}
            </Button>
          </div>
        </Card>
      )}

      {isCooperado && resumoCooperado && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Pagas", value: resumoCooperado.pagas, color: "text-green-700" },
            { label: "Pendentes", value: resumoCooperado.pendentes, color: "text-yellow-700" },
            { label: "Vencidas", value: resumoCooperado.vencidas, color: "text-red-700" },
            { label: "Aguardando", value: resumoCooperado.aguardando, color: "text-blue-700" },
          ].map((s) => (
            <div key={s.label} className="bg-white border rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {!isCooperado && aguardandoConfirmacao.length > 0 && (
        <Card title={`Aguardando confirmação (${aguardandoConfirmacao.length})`} className="mb-6 border-blue-200">
          <p className="text-sm text-gray-600 mb-4">
            Cooperados informaram pagamento. Confira no extrato bancário e confirme abaixo.
          </p>
          <div className="space-y-3">
            {aguardandoConfirmacao.map((m) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div>
                  <p className="font-medium">{getCooperadoNome(data.cooperados, m.cooperadoId)}</p>
                  <p className="text-sm text-gray-600">
                    {formatMesReferencia(m.mesReferencia)} · {formatCurrency(m.valor)} · informado em{" "}
                    {m.informadoPagamentoEm ? formatDate(m.informadoPagamentoEm.split("T")[0]) : "—"}
                  </p>
                </div>
                {check("mensalidades", "edit") && (
                  <Button onClick={() => handleConfirmar(m)}>
                    <CheckCircle2 size={18} /> Confirmar pagamento
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <FilterBar>
        <FormField label="Mês">
          <Select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)} className="min-w-[180px]">
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[200px]">
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="atrasada">Vencida</option>
            <option value="aguardando_confirmacao">Aguardando confirmação</option>
            <option value="paga">Paga</option>
          </Select>
        </FormField>
      </FilterBar>

      <DataTable
        data={mensalidades}
        keyField="id"
        emptyMessage={
          cfgOk || isCooperado
            ? "Nenhuma mensalidade neste período."
            : "Configure a geração automática no Perfil da cooperativa."
        }
        mobileCard={(m) => (
          <MensalidadeCard
            m={m}
            data={data}
            isCooperado={isCooperado}
            canConfirm={check("mensalidades", "edit")}
            onPix={() => abrirPix(m)}
            onPaguei={() => handlePaguei(m)}
            onConfirmar={() => handleConfirmar(m)}
          />
        )}
        columns={[
          ...(!isCooperado
            ? [{ key: "coop", label: "Cooperado", render: (m: Mensalidade) => getCooperadoNome(data.cooperados, m.cooperadoId) }]
            : []),
          { key: "mes", label: "Mês", render: (m) => formatMesReferencia(m.mesReferencia) },
          { key: "valor", label: "Valor", render: (m) => formatCurrency(m.valor) },
          { key: "vencimento", label: "Vencimento", render: (m) => formatDate(m.vencimento) },
          { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
          {
            key: "acoes",
            label: "Ações",
            render: (m) => (
              <div className="flex flex-wrap gap-2">
                {isCooperado && mensalidadePodePagarComPix(m) && (
                  <>
                    <Button size="sm" onClick={() => abrirPix(m)}><QrCode size={14} /> Pagar PIX</Button>
                    <Button size="sm" variant="secondary" onClick={() => handlePaguei(m)}>Paguei</Button>
                  </>
                )}
                {isCooperado && mensalidadeAguardandoConfirmacao(m) && (
                  <span className="text-xs text-blue-700 flex items-center gap-1">
                    <AlertCircle size={14} /> Aguardando confirmação da diretoria
                  </span>
                )}
                {!isCooperado && m.status === "aguardando_confirmacao" && check("mensalidades", "edit") && (
                  <Button size="sm" onClick={() => handleConfirmar(m)}>Confirmar</Button>
                )}
              </div>
            ),
          },
        ]}
      />

      {mensalidadePix && chavePixCoop && cooperativa && (
        <PixQrModal
          open={pixModalOpen}
          onClose={() => { setPixModalOpen(false); setMensalidadePix(null); }}
          chavePix={chavePixCoop}
          nome={cooperativa.nome}
          valor={mensalidadePix.valor}
        />
      )}
    </div>
  );
}

function MensalidadeCard({
  m,
  data,
  isCooperado,
  canConfirm,
  onPix,
  onPaguei,
  onConfirmar,
}: {
  m: Mensalidade;
  data: NonNullable<ReturnType<typeof useAppData>>;
  isCooperado: boolean;
  canConfirm: boolean;
  onPix: () => void;
  onPaguei: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      {!isCooperado && (
        <p className="font-medium text-sm">{getCooperadoNome(data.cooperados, m.cooperadoId)}</p>
      )}
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-gray-600">{formatMesReferencia(m.mesReferencia)}</p>
        <StatusBadge status={m.status} />
      </div>
      <p className="text-lg font-bold text-gray-900 mt-2">{formatCurrency(m.valor)}</p>
      <p className="text-xs text-gray-500">Vence {formatDate(m.vencimento)}</p>
      {m.status === "paga" && m.dataPagamento && (
        <p className="text-xs text-green-700 mt-1">Paga em {formatDate(m.dataPagamento)}</p>
      )}
      {isCooperado && mensalidadePodePagarComPix(m) && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" className="flex-1" onClick={onPix}><QrCode size={14} /> Pagar PIX</Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={onPaguei}>Paguei</Button>
        </div>
      )}
      {isCooperado && mensalidadeAguardandoConfirmacao(m) && (
        <p className="text-xs text-blue-700 mt-3 flex items-center gap-1">
          <AlertCircle size={14} /> Pendente — aguardando confirmação da diretoria
        </p>
      )}
      {!isCooperado && m.status === "aguardando_confirmacao" && canConfirm && (
        <Button size="sm" className="mt-3 w-full" onClick={onConfirmar}>
          <CheckCircle2 size={14} /> Confirmar pagamento
        </Button>
      )}
    </div>
  );
}
