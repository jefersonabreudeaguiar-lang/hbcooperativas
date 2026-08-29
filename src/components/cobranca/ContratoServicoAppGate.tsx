"use client";

import { useState } from "react";
import { FileSignature, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { updateData } from "@/services/dataStore";
import { assinarContratoServicoSaas, precisaAssinarContratoServico } from "@/services/cobrancaSaasService";
import { getUserCooperativaId, getCooperativaById } from "@/utils/cooperativa";
import {
  CONTRATO_SERVICO_VIGENCIA_INICIO,
  CONTRATO_SERVICO_VERSAO,
  getClausulasContratoServicoApp,
  PROPRIETARIO_APP,
} from "@/config/contratoServicoApp";
import { isDiretoriaRole } from "@/permissions";

export function ContratoServicoAppGate() {
  const { user } = useAuth();
  const data = useAppData();
  const [aceite, setAceite] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!user || !data || !isDiretoriaRole(user.role)) return null;

  const coopId = getUserCooperativaId(user, data);
  const coop = coopId ? getCooperativaById(data, coopId) : undefined;
  if (!coop || !precisaAssinarContratoServico(coop)) return null;

  const clausulas = getClausulasContratoServicoApp();

  const assinar = () => {
    if (!coopId || !aceite) return;
    setErro(null);
    setAssinando(true);
    try {
      updateData((d) => assinarContratoServicoSaas(d, coopId, user.name));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a assinatura.");
    } finally {
      setAssinando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/60">
      <div className="relative bg-white shadow-xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Contrato de serviço do aplicativo</h2>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
        <AlertBanner variant="info" title="Assinatura obrigatória">
          A partir de {CONTRATO_SERVICO_VIGENCIA_INICIO.split("-").reverse().join("/")}, cada cooperativa deve
          assinar este contrato com o proprietário do {PROPRIETARIO_APP.pixNome} (pessoa física, CPF{" "}
          {PROPRIETARIO_APP.cpfFormatado}) para continuar usando o aplicativo com cobrança mensal transparente.
        </AlertBanner>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm space-y-4">
          <p>
            <strong>Cooperativa:</strong> {coop.nome}
          </p>
          <p>
            <strong>Signatário:</strong> {user.name}
          </p>
          <p>
            <strong>Versão do contrato:</strong> {CONTRATO_SERVICO_VERSAO}
          </p>

          {clausulas.map((c) => (
            <div key={c.titulo}>
              <h3 className="font-semibold text-gray-900 mb-1">{c.titulo}</h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {c.itens.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {erro && (
          <AlertBanner variant="error">{erro}</AlertBanner>
        )}

        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-1"
          />
          <span>
            Li e concordo com o contrato de prestação de serviços do aplicativo, incluindo o valor por cooperado,
            pagamento via PIX/boleto ao CPF {PROPRIETARIO_APP.cpfFormatado} e possibilidade de suspensão por
            inadimplência.
          </span>
        </label>

        <Button className="w-full" disabled={!aceite || assinando} onClick={assinar}>
          <FileSignature size={18} />
          {assinando ? "Registrando assinatura…" : "Assinar contrato eletronicamente"}
        </Button>

        <p className="text-xs text-gray-500 flex items-center gap-1">
          <ShieldCheck size={14} /> A assinatura fica registrada localmente com data, hora e responsável.
        </p>
        </div>
      </div>
    </div>
  );
}
