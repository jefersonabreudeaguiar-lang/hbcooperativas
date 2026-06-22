"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/Form";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { getUserFuncaoLabel } from "@/permissions";
import type { EmissorRelatorio, User } from "@/types";

type UsuarioEmissor = Pick<User, "name" | "role" | "funcao">;

interface ModalEmitirRelatorioProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (emissor: EmissorRelatorio) => void;
  user: UsuarioEmissor | null;
  titulo?: string;
}

export function ModalEmitirRelatorio({
  open,
  onClose,
  onConfirm,
  user,
  titulo = "Emitir documento",
}: ModalEmitirRelatorioProps) {
  const [assinatura, setAssinatura] = useState<string | null>(null);

  useEffect(() => {
    if (open) setAssinatura(null);
  }, [open]);

  if (!user) return null;

  const funcao = getUserFuncaoLabel(user);

  const confirmar = () => {
    onConfirm({
      nome: user.name,
      funcao,
      emitidoEm: new Date().toISOString(),
      assinaturaDataUrl: assinatura ?? undefined,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar}>Confirmar emissão</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className="text-gray-500 text-xs uppercase tracking-wide font-semibold mb-1">Responsável emissor</p>
          <p className="font-semibold text-gray-900">{user.name}</p>
          <p className="text-gray-600">{funcao}</p>
        </div>

        <FormField label="Assinatura do responsável emissor" hint="Opcional — aparece no PDF/impressão">
          <SignaturePad onChange={setAssinatura} />
        </FormField>
      </div>
    </Modal>
  );
}

export function buildEmissorFromUser(user: UsuarioEmissor): EmissorRelatorio {
  return {
    nome: user.name,
    funcao: getUserFuncaoLabel(user),
    emitidoEm: new Date().toISOString(),
  };
}
