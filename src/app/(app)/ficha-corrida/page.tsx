"use client";

import { useMemo, useState } from "react";
import { QrCode, XCircle, Wallet, CheckCircle2, FileDown, PenLine } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  getTotalAPagarCooperado,
  getResumoPagamentoCooperado,
  registrarPagamentoCooperado,
  confirmarPagamentoCooperado,
  getPagamentoAguardandoCooperado,
} from "@/services/notaPedidoService";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Select, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { ConfirmDialog, PromptDialog } from "@/components/ui/ConfirmDialog";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { baixarReciboHtml } from "@/utils/recibo";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { FichaCorrida, PagamentoCooperadoRegistro } from "@/types";

function DetalheLancamento({ ficha }: { ficha: FichaCorrida }) {
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-1">
      {(ficha.itens ?? []).map((i) => (
        <div key={i.produtoInstituicaoId} className="flex justify-between gap-2">
          <span>{i.produtoNome} · {i.quantidade} {i.unidade}</span>
          <span>{formatCurrency(i.valorBruto)}</span>
        </div>
      ))}
      {ficha.percentualDescontoCooperativa != null && ficha.descontos > 0 && (
        <div className="flex justify-between text-amber-700">
          <span>Desconto cooperativa ({ficha.percentualDescontoCooperativa}%)</span>
          <span>- {formatCurrency(ficha.descontos)}</span>
        </div>
      )}
      {(ficha.descontosDetalhe ?? []).map((d, idx) => (
        <div key={idx} className="flex justify-between text-red-600">
          <span>{d.motivo}</span>
          <span>- {formatCurrency(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}

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
  const [assinaturaModal, setAssinaturaModal] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState<PagamentoCooperadoRegistro | null>(null);

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

  const resumo = useMemo(() => {
    if (!data) return null;
    const cid = isCooperado ? cooperadoId : cooperadoFilter;
    if (!cid) return null;
    return getResumoPagamentoCooperado(data, cid, mesFilter);
  }, [data, isCooperado, cooperadoId, cooperadoFilter, mesFilter]);

  const totalPendente = resumo?.valorLiquido ?? 0;
  const totalEntregas = resumo?.valorEntregas ?? 0;

  const pagamentoAguardando = useMemo(() => {
    if (!data || !cooperadoId) return undefined;
    return getPagamentoAguardandoCooperado(data, cooperadoId, mesFilter);
  }, [data, cooperadoId, mesFilter]);

  const pagamentoConfirmadoMes = useMemo(() => {
    if (!data) return undefined;
    const cid = isCooperado ? cooperadoId : cooperadoFilter;
    if (!cid) return undefined;
    return data.pagamentosCooperado.find(
      (p) => p.cooperadoId === cid && p.mesReferencia === mesFilter && p.status === "confirmado"
    );
  }, [data, isCooperado, cooperadoId, cooperadoFilter, mesFilter]);

  const arquivoMes = useMemo(() => {
    if (!data) return undefined;
    const cid = isCooperado ? cooperadoId : cooperadoFilter;
    if (!cid) return undefined;
    return data.arquivosMensais.find((a) => a.cooperadoId === cid && a.mesReferencia === mesFilter);
  }, [data, isCooperado, cooperadoId, cooperadoFilter, mesFilter]);

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
      addAuditEntry(registrarPagamentoCooperado(d, cooperadoSelecionado.id, mesFilter, user.name), {
        entityType: "ficha_corrida", entityId: cooperadoSelecionado.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: `Pagamento: ${formatCurrency(totalPendente)}`,
      })
    );
    setConfirmPagamento(false);
    setPagoMsg(`Pagamento registrado! ${cooperadoSelecionado.nomeCompleto.split(" ")[0]} foi notificado(a).`);
  };

  const handleEnviarAssinatura = () => {
    if (!pagamentoAguardando || !assinatura || !user) return;
    updateData((d) => {
      const next = confirmarPagamentoCooperado(d, pagamentoAguardando.id, assinatura);
      const pg = next.pagamentosCooperado.find((p) => p.id === pagamentoAguardando.id);
      if (pg) setPagamentoConfirmado(pg);
      return addAuditEntry(next, {
        entityType: "pagamento", entityId: pagamentoAguardando.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: "Cooperado confirmou pagamento com assinatura",
      });
    });
    setAssinaturaModal(false);
    setAssinatura(null);
  };

  if (!data) return null;

  const pixOk = cooperadoSelecionado && !cooperadoPrecisaCadastrarPix(cooperadoSelecionado.chavePix, cooperadoSelecionado.pixValido);

  return (
    <div>
      <PageHeader
        title={isCooperado ? "Minha ficha" : "Ficha dos cooperados"}
        subtitle={isCooperado ? "Entregas, descontos e pagamentos do mês" : "Conferir entregas, pagar e arquivar por cooperado"}
      />

      {pagoMsg && <AlertBanner variant="success" className="mb-4" onDismiss={() => setPagoMsg("")}>{pagoMsg}</AlertBanner>}

      {isCooperado && pagamentoAguardando && (
        <AlertBanner variant="success" title="Pagamento realizado pela cooperativa" className="mb-4">
          Valor: <strong>{formatCurrency(pagamentoAguardando.valorLiquido)}</strong>. Confirme tocando em{" "}
          <strong>PAGO</strong> e assine o recibo.
          <Button className="mt-3 w-full sm:w-auto" size="lg" onClick={() => setAssinaturaModal(true)}>
            <CheckCircle2 size={18} /> PAGO — assinar recibo
          </Button>
        </AlertBanner>
      )}

      <div className="bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 mb-6 shadow-sm">
        <p className="text-green-100 text-sm">{isCooperado ? "Total a receber" : "Valor a pagar"} · {formatMesReferencia(mesFilter)}</p>
        <p className="text-4xl font-bold mt-2">{formatCurrency(isCooperado && pagamentoAguardando ? pagamentoAguardando.valorLiquido : totalPendente)}</p>
        {resumo && totalEntregas > 0 && (
          <div className="mt-4 text-sm text-green-100 space-y-1 border-t border-green-600/40 pt-3">
            <div className="flex justify-between"><span>Entregas (bruto)</span><span>{formatCurrency(resumo.valorBruto)}</span></div>
            {resumo.descontoCooperativa > 0 && (
              <div className="flex justify-between"><span>Desconto cooperativa</span><span>- {formatCurrency(resumo.descontoCooperativa)}</span></div>
            )}
            {resumo.descontosExtras.map((d, i) => (
              <div key={i} className="flex justify-between"><span>{d.motivo}</span><span>- {formatCurrency(d.valor)}</span></div>
            ))}
            <div className="flex justify-between font-semibold text-white pt-1"><span>Total líquido</span><span>{formatCurrency(totalPendente)}</span></div>
          </div>
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
                <span className="text-red-600 font-medium">Não cadastrada</span>
              )}
            </div>
            {check("ficha_corrida", "edit") && (
              <div className="flex flex-col gap-3">
                <Button onClick={() => setPixModalOpen(true)} disabled={!pixOk || totalPendente <= 0} size="lg" className="w-full">
                  <QrCode size={20} /> Gerar QR Code PIX
                </Button>
                <Button
                  size="lg"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setConfirmPagamento(true)}
                  disabled={totalPendente <= 0}
                >
                  <CheckCircle2 size={20} /> Pagamento realizado
                </Button>
                <Button variant="secondary" onClick={() => { setMotivoPix("Chave PIX não encontrada ou incorreta."); setPixInvalidoOpen(true); }}>
                  <XCircle size={18} /> Chave PIX com problema
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {(pagamentoConfirmadoMes || pagamentoConfirmado) && (
        <Card title="Comprovante de recebimento" className="mb-6">
          <p className="text-sm text-gray-600 mb-3">Recibo assinado e arquivado na pasta de {formatMesReferencia(mesFilter)}.</p>
          <Button
            onClick={() => {
              const pg = pagamentoConfirmado ?? pagamentoConfirmadoMes;
              if (pg?.reciboHtml) baixarReciboHtml(pg.reciboHtml, `recibo-${mesFilter}.html`);
            }}
          >
            <FileDown size={18} /> Baixar comprovante
          </Button>
        </Card>
      )}

      {!isCooperado && arquivoMes && arquivoMes.notaPedidoIds.length > 0 && (
        <Card title={`Arquivo ${formatMesReferencia(mesFilter)}`} className="mb-6">
          <p className="text-sm text-gray-600 mb-3">
            {arquivoMes.notaPedidoIds.length} entrega(s) · {arquivoMes.pagamentoIds.length} recibo(s) arquivados
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {arquivoMes.notaPedidoIds.map((nid) => {
              const nota = data.notasPedido.find((n) => n.id === nid);
              if (!nota?.fotoPedido) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={nid} src={nota.fotoPedido} alt="" className="w-full h-24 object-cover rounded-lg border" />
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Histórico — ficha corrida">
        <DataTable
          data={lancamentos}
          keyField="id"
          emptyMessage="Nenhum lançamento neste mês."
          mobileCard={(f) => (
            <div className="bg-white border rounded-xl p-4">
              <p className="font-medium text-sm">{f.descricao}</p>
              <p className="text-xs text-gray-500 mt-1">{formatDate(f.dataLancamento)}</p>
              <DetalheLancamento ficha={f} />
              <p className="text-lg font-bold text-green-700 mt-2">{formatCurrency(f.valorLiquido)}</p>
              <span className="text-xs text-gray-500">{f.status === "pago" ? "Pago" : "Aguardando pagamento"}</span>
            </div>
          )}
          columns={[
            { key: "data", label: "Data", render: (f) => formatDate(f.dataLancamento) },
            ...(!isCooperado ? [{ key: "coop", label: "Cooperado", render: (f: FichaCorrida) => getCooperadoNome(data.cooperados, f.cooperadoId) }] : []),
            {
              key: "descricao",
              label: "Entrega / itens",
              render: (f) => (
                <div>
                  <p>{f.descricao}</p>
                  <DetalheLancamento ficha={f} />
                </div>
              ),
            },
            { key: "valor", label: "A receber", render: (f) => formatCurrency(f.valorLiquido) },
            { key: "status", label: "Situação", render: (f) => (f.status === "pago" ? "Pago" : "Pendente") },
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
        message={`Registrar pagamento de ${formatCurrency(totalPendente)} para ${cooperadoSelecionado?.nomeCompleto}? O cooperado receberá aviso para assinar o recibo.`}
        confirmLabel="Sim, pagamento realizado"
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

      <Modal
        open={assinaturaModal}
        onClose={() => setAssinaturaModal(false)}
        title="Confirmar recebimento"
        size="md"
        footer={
          <Button size="lg" className="w-full" disabled={!assinatura} onClick={handleEnviarAssinatura}>
            <PenLine size={18} /> Enviar assinatura
          </Button>
        }
      >
        <div className="bg-white rounded-xl p-2">
          <p className="text-center text-gray-700 font-medium mb-4">Assine aqui para confirmar que recebeu o pagamento</p>
          <SignaturePad onChange={setAssinatura} />
        </div>
      </Modal>
    </div>
  );
}
