"use client";

import { Users } from "lucide-react";
import { Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/utils/format";
import type { Cooperado, DivisaoEntregaNota, FichaCorrida } from "@/types";
import { nomesParticipantesDivisao, textoInformativoDivisaoEntrega } from "@/services/divisaoEntregaService";

interface DivisaoEntregaModalProps {
  open: boolean;
  onClose: () => void;
  ficha: FichaCorrida | null;
  cooperadoOrigemNome: string;
  valorLiquidoTotal?: number;
  cooperadosDisponiveis: Cooperado[];
  selecionados: string[];
  onToggle: (cooperadoId: string) => void;
  onConfirm: () => void;
  salvando?: boolean;
  divisaoAtual?: DivisaoEntregaNota;
}

export function DivisaoEntregaModal({
  open,
  onClose,
  ficha,
  cooperadoOrigemNome,
  valorLiquidoTotal,
  cooperadosDisponiveis,
  selecionados,
  onToggle,
  onConfirm,
  salvando,
  divisaoAtual,
}: DivisaoEntregaModalProps) {
  const totalParticipantes = 1 + selecionados.length;
  const valorEntrega = valorLiquidoTotal ?? ficha?.valorLiquido ?? 0;
  const valorDividido =
    ficha && totalParticipantes > 1 ? valorEntrega / totalParticipantes : valorEntrega;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dividir valor de entrega"
      size="md"
      footer={
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={salvando || selecionados.length === 0}>
            <Users size={16} />
            {salvando ? "Salvando…" : `Dividir entre ${totalParticipantes}`}
          </Button>
        </div>
      }
    >
      {ficha && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            <p className="font-semibold text-gray-900">{ficha.descricao}</p>
            <p className="text-gray-600 mt-1">
              Lançado por <strong>{cooperadoOrigemNome}</strong>
            </p>
            <p className="text-green-700 font-bold mt-2">{formatCurrency(valorEntrega)} líquido</p>
            {selecionados.length > 0 && (
              <p className="text-xs text-gray-600 mt-2">
                Cada cooperado receberá cerca de{" "}
                <strong>{formatCurrency(valorDividido)}</strong> nesta entrega.
              </p>
            )}
          </div>

          {divisaoAtual && divisaoAtual.participantes.length > 1 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">{textoInformativoDivisaoEntrega(divisaoAtual)}</p>
              <p className="text-xs mt-1 text-blue-800">{nomesParticipantesDivisao(divisaoAtual)}</p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">
              Quem participou desta entrega? (além de {cooperadoOrigemNome.split(" ")[0]})
            </p>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {cooperadosDisponiveis.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Nenhum outro cooperado cadastrado.</p>
              ) : (
                cooperadosDisponiveis.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      checked={selecionados.includes(c.id)}
                      onChange={() => onToggle(c.id)}
                    />
                    <span className="text-sm font-medium text-gray-900">{c.nomeCompleto}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <strong>{cooperadoOrigemNome}</strong> entra automaticamente na divisão.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
