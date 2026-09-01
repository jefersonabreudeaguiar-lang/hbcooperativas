"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { gerarPixCopiaCola } from "@/utils/pix";
import { formatCurrency } from "@/utils/format";
import { Copy, QrCode, Smartphone } from "lucide-react";

interface PixQrModalProps {
  open: boolean;
  onClose: () => void;
  chavePix: string;
  nome: string;
  valor: number;
  hintAposPagamento?: string;
  onEnviarComprovante?: () => void;
  /** Rótulo do botão após pagamento (padrão: Enviar comprovante). */
  confirmLabel?: string;
}

export function PixQrModal({
  open,
  onClose,
  chavePix,
  nome,
  valor,
  hintAposPagamento,
  onEnviarComprovante,
  confirmLabel = "Enviar comprovante",
}: PixQrModalProps) {
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedChave, setCopiedChave] = useState(false);
  const payload = gerarPixCopiaCola({ chave: chavePix, valor, nome });

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(payload, { width: 280, margin: 2 }).then(setQrUrl).catch(() => setQrUrl(""));
  }, [open, payload]);

  const copyPayload = async () => {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyChave = async () => {
    await navigator.clipboard.writeText(chavePix);
    setCopiedChave(true);
    setTimeout(() => setCopiedChave(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pagar com PIX" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl text-sm text-blue-900">
          <Smartphone size={22} className="shrink-0" />
          <p>Abra o app do seu banco → <strong>PIX</strong> → <strong>Pagar com QR Code</strong> e aponte para a imagem abaixo.</p>
        </div>

        <p className="text-center text-sm text-gray-600">
          <strong>{formatCurrency(valor)}</strong> para {nome.split(" ")[0]}
        </p>

        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt="QR Code PIX" className="mx-auto rounded-xl border-4 border-green-100" />
        ) : (
          <div className="py-12 text-center text-gray-400"><QrCode size={48} className="mx-auto mb-2" />Gerando...</div>
        )}

        <Button variant="secondary" className="w-full" onClick={copyChave}>
          <Copy size={16} /> {copiedChave ? "Chave copiada!" : "Copiar chave PIX"}
        </Button>
        <Button variant="secondary" className="w-full" onClick={copyPayload}>
          <Copy size={16} /> {copied ? "Código copiado!" : "Copiar PIX copia e cola"}
        </Button>

        {hintAposPagamento && (
          <p className="text-xs text-gray-600 text-center px-2">{hintAposPagamento}</p>
        )}
        {onEnviarComprovante && (
          <Button className="w-full" onClick={onEnviarComprovante}>
            {confirmLabel}
          </Button>
        )}
      </div>
    </Modal>
  );
}
