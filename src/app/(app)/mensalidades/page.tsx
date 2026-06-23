"use client";

import { Suspense, useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { QrCode, Copy, CheckCircle2, Info, AlertCircle, Paperclip, ImagePlus, Eye } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { formatCnpj } from "@/utils/cooperativa";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import {
  getChavePixMensalidadeCooperativa,
  cooperadoInformouPagamentoMensalidade,
  confirmarPagamentoMensalidade,
  mensalidadePodePagarComPix,
  mensalidadeAguardandoConfirmacao,
  isAvisoMensalidadeVenceAmanha,
  textoAvisoMensalidadeAmanha,
  listarMensalidadesExibicaoCooperado,
  listarMensalidadesCooperado,
  statusEfetivoMensalidade,
  mensalidadeListagemVisivel,
  mensalidadeCobrancaVisivel,
  mesesCobrancaEfetivos,
} from "@/services/mensalidadeService";
import { compressDataUrl, compressFotoFile } from "@/utils/fotoEntrega";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Mensalidade } from "@/types";
import { MensalidadeConfigPanel } from "@/components/mensalidade/MensalidadeConfigPanel";
import { MensalidadeStatusBanner } from "@/components/cooperado/MensalidadeStatusBanner";

const SHARE_KEY = "hb_comprovante_mensalidade_share";

const INFO_COOPERADO =
  "Pague via PIX para o CNPJ da cooperativa. Depois compartilhe o comprovante do banco para este app (Compartilhar → HB Cooperativas) ou toque em Enviar comprovante. A diretoria confirma ao ver o PIX no extrato.";

const INFO_RESPONSAVEL =
  "Quando o cooperado enviar o comprovante, ele aparece aqui para você conferir no extrato e confirmar o pagamento.";

export default function MensalidadesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <MensalidadesContent />
    </Suspense>
  );
}

function MensalidadesContent() {
  const data = useAppData();
  const searchParams = useSearchParams();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("");
  const [mesFilter, setMesFilter] = useState("");
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [mensalidadePix, setMensalidadePix] = useState<Mensalidade | null>(null);
  const [copiedCnpj, setCopiedCnpj] = useState(false);
  const [comprovanteModalOpen, setComprovanteModalOpen] = useState(false);
  const [comprovanteMensalidadeId, setComprovanteMensalidadeId] = useState("");
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [comprovanteEnviando, setComprovanteEnviando] = useState(false);
  const [comprovanteMsg, setComprovanteMsg] = useState("");
  const [comprovanteErro, setComprovanteErro] = useState("");
  const [verComprovante, setVerComprovante] = useState<Mensalidade | null>(null);
  const comprovanteInputRef = useRef<HTMLInputElement>(null);
  const shareHandledRef = useRef(false);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const cooperativa = coopId ? data?.cooperativas.find((c) => c.id === coopId) : undefined;
  const chavePixCoop = coopId && data ? getChavePixMensalidadeCooperativa(data, coopId) : null;

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
    const base = isCooperado && cooperadoId
      ? listarMensalidadesExibicaoCooperado(data, cooperadoId, coopId)
      : data.mensalidades.filter((m) => {
          const c = data.cooperados.find((x) => x.id === m.cooperadoId);
          return !coopId || c?.cooperativaId === coopId;
        });

    return base
      .filter((m) => {
        if (!statusFilter && !mensalidadeListagemVisivel(m)) return false;
        if (statusFilter && statusEfetivoMensalidade(m) !== statusFilter) return false;
        if (mesFilter && m.mesReferencia !== mesFilter) return false;
        return true;
      })
      .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia) || a.vencimento.localeCompare(b.vencimento));
  }, [data, statusFilter, mesFilter, isCooperado, cooperadoId, coopId]);

  const mensalidadesPagaveis = useMemo(
    () => mensalidades.filter((m) => mensalidadePodePagarComPix(m)),
    [mensalidades]
  );

  const aguardandoConfirmacao = useMemo(
    () => {
      if (!data) return [];
      const base = isCooperado && cooperadoId
        ? listarMensalidadesCooperado(data, cooperadoId, coopId)
        : data.mensalidades.filter((m) => {
            const c = data.cooperados.find((x) => x.id === m.cooperadoId);
            return !coopId || c?.cooperativaId === coopId;
          });
      return base
        .filter((m) => m.status === "aguardando_confirmacao")
        .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
    },
    [data, coopId, isCooperado, cooperadoId]
  );

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    const set = new Set<string>();
    const base = isCooperado && cooperadoId
      ? listarMensalidadesExibicaoCooperado(data, cooperadoId, coopId)
      : data.mensalidades.filter((m) => {
          const c = data.cooperados.find((x) => x.id === m.cooperadoId);
          return !coopId || c?.cooperativaId === coopId;
        });
    for (const m of base) set.add(m.mesReferencia);
    if (cooperativa?.mensalidadeConfig) {
      for (const mes of mesesCobrancaEfetivos(cooperativa.mensalidadeConfig)) set.add(mes);
    }
    set.add(getCurrentMesReferencia());
    return [...set].sort().reverse();
  }, [data, isCooperado, cooperadoId, coopId, cooperativa?.mensalidadeConfig]);

  const resumoCooperado = useMemo(() => {
    if (!isCooperado || !cooperadoId || !data) return null;
    const todas = listarMensalidadesExibicaoCooperado(data, cooperadoId, coopId);
    return {
      pagas: todas.filter((m) => m.status === "paga").length,
      vencidas: todas.filter((m) => mensalidadeCobrancaVisivel(m) && statusEfetivoMensalidade(m) === "atrasada").length,
      pendentes: 0,
      aguardando: todas.filter((m) => m.status === "aguardando_confirmacao").length,
    };
  }, [data, isCooperado, cooperadoId, coopId]);

  const abrirPix = (m: Mensalidade) => {
    setMensalidadePix(m);
    setPixModalOpen(true);
  };

  const abrirComprovante = (m?: Mensalidade, preview?: string | null) => {
    setComprovanteErro("");
    setComprovanteMsg("");
    setComprovantePreview(preview ?? null);
    const alvo =
      m?.id ??
      mensalidadesPagaveis[0]?.id ??
      mensalidades.find((x) => x.mesReferencia === mesFilter)?.id ??
      "";
    setComprovanteMensalidadeId(alvo);
    setComprovanteModalOpen(true);
  };

  useEffect(() => {
    if (!isCooperado || shareHandledRef.current) return;
    if (searchParams.get("comprovante") !== "1") return;
    shareHandledRef.current = true;

    const erro = searchParams.get("erro");
    if (erro === "sem-arquivo") setComprovanteErro("Nenhuma imagem recebida. Tire print do comprovante e compartilhe de novo.");
    else if (erro === "arquivo-grande") setComprovanteErro("Arquivo muito grande. Use print da tela ou envie pelo botão Enviar comprovante.");
    else if (erro) setComprovanteErro("Não foi possível ler o comprovante compartilhado. Tente enviar manualmente.");

    const raw = typeof window !== "undefined" ? sessionStorage.getItem(SHARE_KEY) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { dataUrl?: string };
        sessionStorage.removeItem(SHARE_KEY);
        if (parsed.dataUrl) {
          void compressDataUrl(parsed.dataUrl, 960, 0.65).then((compressed) => {
            abrirComprovante(undefined, compressed);
          });
          return;
        }
      } catch {
        sessionStorage.removeItem(SHARE_KEY);
      }
    }

    abrirComprovante();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCooperado, searchParams]);

  const copiarCnpjPix = async () => {
    if (!chavePixCoop) return;
    await navigator.clipboard.writeText(chavePixCoop);
    setCopiedCnpj(true);
    setTimeout(() => setCopiedCnpj(false), 2000);
  };

  const handleArquivoComprovante = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = file.type === "application/pdf"
        ? await readPdfAsDataUrl(file)
        : await compressFotoFile(file);
      setComprovantePreview(dataUrl);
      setComprovanteErro("");
    } catch {
      setComprovanteErro("Não foi possível ler o arquivo. Tente outra imagem.");
    } finally {
      if (comprovanteInputRef.current) comprovanteInputRef.current.value = "";
    }
  };

  const handleEnviarComprovante = () => {
    if (!user || !comprovanteMensalidadeId || !comprovantePreview) {
      setComprovanteErro("Escolha a mensalidade e anexe o comprovante do PIX.");
      return;
    }

    setComprovanteEnviando(true);
    setComprovanteErro("");

    updateData((d) => {
      const next = cooperadoInformouPagamentoMensalidade(d, comprovanteMensalidadeId, comprovantePreview);
      if (!next) return d;
      return addAuditEntry(next, {
        entityType: "mensalidade",
        entityId: comprovanteMensalidadeId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Comprovante PIX enviado para a cooperativa",
      });
    });

    pushOperacional();
    setComprovanteEnviando(false);
    setComprovanteModalOpen(false);
    setComprovantePreview(null);
    setStatusFilter("aguardando_confirmacao");
    setComprovanteMsg("Comprovante enviado! A diretoria vai conferir e confirmar o pagamento.");
    setTimeout(() => setComprovanteMsg(""), 8000);
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

  const cfgOk =
    cooperativa?.mensalidadeConfig?.gerarAutomaticamente &&
    (cooperativa.mensalidadeConfig.valorPadrao ?? 0) > 0 &&
    (cooperativa.mensalidadeConfig.mesesCobranca?.length ?? 0) > 0;

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

      {comprovanteMsg && (
        <AlertBanner variant="success" title="Comprovante enviado" className="mb-6" onDismiss={() => setComprovanteMsg("")}>
          {comprovanteMsg}
        </AlertBanner>
      )}

      {comprovanteErro && !comprovanteModalOpen && (
        <AlertBanner variant="error" className="mb-6" onDismiss={() => setComprovanteErro("")}>
          {comprovanteErro}
        </AlertBanner>
      )}

      {isCooperado && cooperativa?.mensalidadeConfig && isAvisoMensalidadeVenceAmanha(cooperativa.mensalidadeConfig) && (
        <AlertBanner variant="warning" title="Mensalidade vence amanhã" className="mb-6">
          {textoAvisoMensalidadeAmanha(cooperativa.mensalidadeConfig)}
        </AlertBanner>
      )}

      {!isCooperado && user && coopId && (
        <MensalidadeConfigPanel
          cooperativaId={coopId}
          user={user}
          canEdit={check("mensalidades", "edit")}
        />
      )}

      {!isCooperado && !cfgOk && (
        <AlertBanner variant="warning" title="Configure a mensalidade fixa" className="mb-6">
          Informe o <strong>valor fixo</strong>, o <strong>dia da mensalidade</strong> e marque os <strong>meses de cobrança</strong> no painel acima.
          O valor será descontado automaticamente nos pagamentos dos cooperados.
        </AlertBanner>
      )}

      {isCooperado && cooperadoId && (
        <div className="mb-6">
          <MensalidadeStatusBanner cooperadoId={cooperadoId} modo="geral" />
        </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[
            { label: "Vencidas", value: resumoCooperado.vencidas, color: "text-red-700" },
            { label: "Aguardando", value: resumoCooperado.aguardando, color: "text-blue-700" },
            { label: "Pagas", value: resumoCooperado.pagas, color: "text-green-700" },
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
            Cooperados enviaram comprovante ou informaram pagamento. Confira no extrato bancário.
          </p>
          <div className="space-y-3">
            {aguardandoConfirmacao.map((m) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{getCooperadoNome(data.cooperados, m.cooperadoId)}</p>
                  <p className="text-sm text-gray-600">
                    {formatMesReferencia(m.mesReferencia)} · {formatCurrency(m.valor)} · informado em{" "}
                    {m.informadoPagamentoEm ? formatDate(m.informadoPagamentoEm.split("T")[0]) : "—"}
                  </p>
                  {m.comprovante && (
                    <div className="mt-3">
                      {m.comprovante.startsWith("data:image") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.comprovante}
                          alt="Comprovante PIX"
                          className="max-h-36 rounded-lg border border-blue-200 cursor-pointer"
                          onClick={() => setVerComprovante(m)}
                        />
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setVerComprovante(m)}>
                          <Eye size={16} /> Ver comprovante
                        </Button>
                      )}
                    </div>
                  )}
                  {!m.comprovante && (
                    <p className="text-xs text-amber-700 mt-2">Sem comprovante anexado — cooperado informou pagamento.</p>
                  )}
                </div>
                {check("mensalidades", "edit") && (
                  <Button className="shrink-0" onClick={() => handleConfirmar(m)}>
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
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[200px]">
            <option value="">Todos</option>
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
            : "Configure o valor fixo e os meses de cobrança no painel acima."
        }
        mobileCard={(m) => (
          <MensalidadeCard
            m={m}
            data={data}
            isCooperado={isCooperado}
            canConfirm={check("mensalidades", "edit")}
            onPix={() => abrirPix(m)}
            onComprovante={() => abrirComprovante(m)}
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
          { key: "status", label: "Status", render: (m) => <StatusBadge status={statusEfetivoMensalidade(m)} /> },
          {
            key: "acoes",
            label: "Ações",
            render: (m) => (
              <div className="flex flex-wrap gap-2">
                {isCooperado && mensalidadePodePagarComPix(m) && (
                  <>
                    <Button size="sm" onClick={() => abrirPix(m)}><QrCode size={14} /> Pagar PIX</Button>
                    <Button size="sm" variant="secondary" onClick={() => abrirComprovante(m)}>
                      <Paperclip size={14} /> Enviar comprovante
                    </Button>
                  </>
                )}
                {isCooperado && mensalidadeAguardandoConfirmacao(m) && (
                  <span className="text-xs text-blue-700 flex items-center gap-1">
                    <AlertCircle size={14} /> Aguardando confirmação da diretoria
                  </span>
                )}
                {!isCooperado && m.status === "aguardando_confirmacao" && (
                  <>
                    {m.comprovante && (
                      <Button size="sm" variant="secondary" onClick={() => setVerComprovante(m)}>
                        <Eye size={14} /> Comprovante
                      </Button>
                    )}
                    {check("mensalidades", "edit") && (
                      <Button size="sm" onClick={() => handleConfirmar(m)}>Confirmar</Button>
                    )}
                  </>
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
          hintAposPagamento="Depois de pagar, compartilhe o comprovante do banco para HB Cooperativas ou toque em Enviar comprovante."
          onEnviarComprovante={() => {
            const m = mensalidadePix;
            setPixModalOpen(false);
            setMensalidadePix(null);
            if (m) abrirComprovante(m);
          }}
        />
      )}

      <Modal
        open={comprovanteModalOpen}
        onClose={() => { if (!comprovanteEnviando) { setComprovanteModalOpen(false); setComprovantePreview(null); } }}
        title="Enviar comprovante PIX"
        size="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="secondary" disabled={comprovanteEnviando} onClick={() => setComprovanteModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="lg"
              disabled={!comprovantePreview || !comprovanteMensalidadeId || comprovanteEnviando}
              onClick={handleEnviarComprovante}
            >
              {comprovanteEnviando ? "Enviando..." : "Enviar para a cooperativa"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {comprovanteErro && (
            <AlertBanner variant="error" onDismiss={() => setComprovanteErro("")}>{comprovanteErro}</AlertBanner>
          )}
          <p className="text-sm text-gray-600">
            Anexe o print ou PDF do comprovante do PIX. A diretoria recebe na fila de confirmação.
          </p>
          <FormField label="Mensalidade" required>
            <Select
              value={comprovanteMensalidadeId}
              onChange={(e) => setComprovanteMensalidadeId(e.target.value)}
            >
              <option value="">Escolha...</option>
              {mensalidadesPagaveis.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMesReferencia(m.mesReferencia)} — {formatCurrency(m.valor)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Comprovante" required>
            <input
              ref={comprovanteInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => void handleArquivoComprovante(e)}
            />
            {comprovantePreview ? (
              <div className="space-y-2">
                {comprovantePreview.startsWith("data:image") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={comprovantePreview} alt="Comprovante" className="w-full max-h-64 object-contain rounded-xl border" />
                ) : (
                  <p className="text-sm text-gray-600 p-4 bg-gray-50 rounded-xl border">PDF anexado</p>
                )}
                <Button variant="secondary" size="sm" onClick={() => comprovanteInputRef.current?.click()}>
                  Trocar arquivo
                </Button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center gap-2 p-8 border-2 border-dashed border-green-400 rounded-2xl bg-green-50/50 cursor-pointer"
                onClick={() => comprovanteInputRef.current?.click()}
              >
                <ImagePlus size={40} className="text-green-700" />
                <span className="text-sm font-medium text-green-800">Toque para anexar comprovante</span>
              </label>
            )}
          </FormField>
        </div>
      </Modal>

      <Modal open={Boolean(verComprovante)} onClose={() => setVerComprovante(null)} title="Comprovante PIX" size="md">
        {verComprovante?.comprovante && (
          verComprovante.comprovante.startsWith("data:image") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={verComprovante.comprovante} alt="Comprovante" className="w-full rounded-xl border" />
          ) : (
            <iframe src={verComprovante.comprovante} title="Comprovante PDF" className="w-full h-[70vh] rounded-xl border" />
          )
        )}
      </Modal>
    </div>
  );
}

async function readPdfAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function MensalidadeCard({
  m,
  data,
  isCooperado,
  canConfirm,
  onPix,
  onComprovante,
  onConfirmar,
}: {
  m: Mensalidade;
  data: NonNullable<ReturnType<typeof useAppData>>;
  isCooperado: boolean;
  canConfirm: boolean;
  onPix: () => void;
  onComprovante: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="bg-white border rounded-xl p-4">
      {!isCooperado && (
        <p className="font-medium text-sm">{getCooperadoNome(data.cooperados, m.cooperadoId)}</p>
      )}
      <div className="flex items-center justify-between mt-1">
        <p className="text-sm text-gray-600">{formatMesReferencia(m.mesReferencia)}</p>
        <StatusBadge status={statusEfetivoMensalidade(m)} />
      </div>
      <p className="text-lg font-bold text-gray-900 mt-2">{formatCurrency(m.valor)}</p>
      <p className="text-xs text-gray-500">Vence {formatDate(m.vencimento)}</p>
      {m.status === "paga" && m.dataPagamento && (
        <p className="text-xs text-green-700 mt-1">Paga em {formatDate(m.dataPagamento)}</p>
      )}
      {isCooperado && mensalidadePodePagarComPix(m) && (
        <div className="flex flex-col gap-2 mt-3">
          <Button size="sm" className="w-full" onClick={onPix}><QrCode size={14} /> Pagar PIX</Button>
          <Button size="sm" variant="secondary" className="w-full" onClick={onComprovante}>
            <Paperclip size={14} /> Enviar comprovante
          </Button>
        </div>
      )}
      {isCooperado && mensalidadeAguardandoConfirmacao(m) && (
        <p className="text-xs text-blue-700 mt-3 flex items-center gap-1">
          <AlertCircle size={14} /> Pendente — aguardando confirmação da diretoria
        </p>
      )}
      {!isCooperado && m.status === "aguardando_confirmacao" && (
        <div className="flex flex-col gap-2 mt-3">
          {m.comprovante && m.comprovante.startsWith("data:image") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.comprovante} alt="Comprovante" className="max-h-28 rounded-lg border object-contain" />
          )}
          {canConfirm && (
            <Button size="sm" className="w-full" onClick={onConfirmar}>
              <CheckCircle2 size={14} /> Confirmar pagamento
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
