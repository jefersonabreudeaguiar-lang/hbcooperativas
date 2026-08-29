"use client";

import { useMemo, useState } from "react";
import { Archive, Download, Loader2 } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { ContadorAccessGuard } from "@/components/contador/ContadorAccessGuard";
import { PageHeader } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { ModalEmitirRelatorio } from "@/components/relatorios/ModalEmitirRelatorio";
import { buildDossieMensalArquivos, nomeArquivoDossie } from "@/services/contadorDossieService";
import { listMesesConciliacao } from "@/services/conciliacaoMensalService";
import { getSnapshotFechamentoMes } from "@/services/fechamentoSnapshotService";
import { baixarDossieZip } from "@/utils/downloadDossie";
import { getCooperativaById } from "@/utils/cooperativa";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { EmissorRelatorio } from "@/types";

export default function ContadorDossiePage() {
  const data = useAppData();
  const { user, coopId } = usePermissions();
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [gerando, setGerando] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const meses = useMemo(() => (data ? listMesesConciliacao(data) : [mes]), [data, mes]);
  const fechamento = useMemo(
    () => data?.fechamentos.find((f) => f.mesReferencia === mes),
    [data, mes]
  );
  const snapshot = useMemo(() => {
    if (!data || !coopId) return undefined;
    return getSnapshotFechamentoMes(data, coopId, mes);
  }, [data, coopId, mes]);

  if (!data || !user || !coopId) return null;

  const coop = getCooperativaById(data, coopId);

  const gerarZip = async (emissor: EmissorRelatorio) => {
    setModalOpen(false);
    setErro(null);
    setGerando(true);
    try {
      const arquivos = buildDossieMensalArquivos(data, mes, coopId, emissor);
      await baixarDossieZip(arquivos, nomeArquivoDossie(mes, coop?.cnpj));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o dossiê.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <ContadorAccessGuard>
      <PageHeader
        title="Dossiê contábil mensal"
        subtitle={`Pacote ZIP com relatórios R1–R10 · ${formatMesReferencia(mes)}`}
      />

      <div className="flex flex-wrap gap-4 mb-6">
        <FormField label="Mês de referência">
          <Select value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {formatMesReferencia(m)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {erro && (
        <AlertBanner variant="error" className="mb-4">
          {erro}
        </AlertBanner>
      )}

      <Card className="mb-6">
        <div className="flex items-start gap-3">
          <Archive className="text-green-700 shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Conteúdo do ZIP</h2>
            <ul className="mt-3 text-sm text-gray-600 space-y-1 list-disc pl-5">
              <li>Fechamento mensal e conciliação (R4)</li>
              <li>Demonstrativo de pagamentos (R2), mapa de receitas (R3)</li>
              <li>Extrato Conta Coop (R5) e razão analítico (R1)</li>
              <li>Trilha de auditoria em CSV (R6)</li>
              <li>Relatório para assembleia (R10)</li>
              <li>Parecer contábil assinado (R9), se existir</li>
              <li>Snapshot JSON do fechamento aprovado, se capturado</li>
            </ul>
            <p className="mt-4 text-sm text-gray-500">
              Status fechamento: <strong>{fechamento?.status ?? "Não iniciado"}</strong>
              {snapshot ? ` · Snapshot ${snapshot.contentHash}` : " · Sem snapshot (aprove o fechamento para congelar)"}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <Button onClick={() => setModalOpen(true)} disabled={gerando}>
            {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {gerando ? "Gerando ZIP…" : "Baixar dossiê ZIP"}
          </Button>
        </div>
      </Card>

      <ModalEmitirRelatorio
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={gerarZip}
        user={user}
        titulo="Emitir dossiê contábil (ZIP)"
      />
    </ContadorAccessGuard>
  );
}
