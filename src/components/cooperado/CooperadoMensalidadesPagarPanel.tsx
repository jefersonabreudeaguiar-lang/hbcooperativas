"use client";

import { useMemo, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { FormField, Select } from "@/components/ui/Form";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { MensalidadeCooperadoCard } from "@/components/mensalidade/MensalidadeCooperadoCard";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import {
  cooperadoInformouPagamentoMensalidade,
  getChavePixMensalidadeCooperativa,
  listarMensalidadesExibicaoCooperado,
  mensalidadePodePagarComPix,
} from "@/services/mensalidadeService";
import { compressDataUrl, compressFotoFile } from "@/utils/fotoEntrega";
import { formatCurrency, formatMesReferencia } from "@/utils/format";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { Mensalidade } from "@/types";

async function readPdfAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function CooperadoMensalidadesPagarPanel({ cooperadoId }: { cooperadoId: string }) {
  const data = useAppData();
  const { user } = useAuth();
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [mensalidadePix, setMensalidadePix] = useState<Mensalidade | null>(null);
  const [comprovanteModalOpen, setComprovanteModalOpen] = useState(false);
  const [comprovanteMensalidadeId, setComprovanteMensalidadeId] = useState("");
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [comprovanteEnviando, setComprovanteEnviando] = useState(false);
  const [comprovanteErro, setComprovanteErro] = useState("");
  const [comprovanteMsg, setComprovanteMsg] = useState("");

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const cooperativa = coopId ? data?.cooperativas.find((c) => c.id === coopId) : undefined;
  const chavePixCoop = coopId && data ? getChavePixMensalidadeCooperativa(data, coopId) : null;

  const mensalidadesPagaveis = useMemo(() => {
    if (!data) return [];
    return listarMensalidadesExibicaoCooperado(data, cooperadoId, coopId)
      .filter((m) => mensalidadePodePagarComPix(m))
      .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia) || a.vencimento.localeCompare(b.vencimento));
  }, [data, cooperadoId, coopId]);

  const pushOperacional = () => {
    void (async () => {
      if (!user || !coopId) return;
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
  };

  const abrirPix = (m: Mensalidade) => {
    setMensalidadePix(m);
    setPixModalOpen(true);
  };

  const abrirComprovante = (m?: Mensalidade) => {
    setComprovanteErro("");
    setComprovanteMensalidadeId(m?.id ?? mensalidadesPagaveis[0]?.id ?? "");
    setComprovantePreview(null);
    setComprovanteModalOpen(true);
  };

  const handleArquivoComprovante = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl =
        file.type === "application/pdf" ? await readPdfAsDataUrl(file) : await compressFotoFile(file);
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
    setComprovanteMsg("Comprovante enviado! A diretoria vai conferir e confirmar o pagamento.");
    setTimeout(() => setComprovanteMsg(""), 8000);
  };

  if (!data || mensalidadesPagaveis.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mensalidades</p>

      {comprovanteMsg && (
        <AlertBanner variant="success" title="Comprovante enviado" onDismiss={() => setComprovanteMsg("")}>
          {comprovanteMsg}
        </AlertBanner>
      )}

      {mensalidadesPagaveis.map((m) => (
        <MensalidadeCooperadoCard
          key={m.id}
          mensalidade={m}
          onPix={() => abrirPix(m)}
          onComprovante={() => abrirComprovante(m)}
        />
      ))}

      {mensalidadePix && chavePixCoop && cooperativa && (
        <PixQrModal
          open={pixModalOpen}
          onClose={() => {
            setPixModalOpen(false);
            setMensalidadePix(null);
          }}
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
        onClose={() => {
          if (!comprovanteEnviando) {
            setComprovanteModalOpen(false);
            setComprovantePreview(null);
          }
        }}
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
            <AlertBanner variant="error" onDismiss={() => setComprovanteErro("")}>
              {comprovanteErro}
            </AlertBanner>
          )}
          <p className="text-sm text-gray-600">
            Anexe o print ou PDF do comprovante do PIX. A diretoria recebe na fila de confirmação.
          </p>
          <FormField label="Mensalidade" required>
            <Select value={comprovanteMensalidadeId} onChange={(e) => setComprovanteMensalidadeId(e.target.value)}>
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
    </section>
  );
}
