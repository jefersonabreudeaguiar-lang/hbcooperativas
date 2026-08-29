"use client";

import { useMemo, useState } from "react";
import { Download, FileCheck, Printer } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { ContadorAccessGuard } from "@/components/contador/ContadorAccessGuard";
import { PageHeader } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select, FormField, Textarea } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { ModalEmitirRelatorio } from "@/components/relatorios/ModalEmitirRelatorio";
import { updateData } from "@/services/dataStore";
import { getParecerContabilMes, salvarParecerContabil } from "@/services/contadorRelatorioService";
import { listMesesConciliacao } from "@/services/conciliacaoMensalService";
import {
  baixarDocumento,
  gerarRelatorioParecerContabilHtml,
  imprimirDocumentoHtml,
  nomeArquivoRelatorio,
} from "@/utils/relatorioHtml";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { EmissorRelatorio } from "@/types";

const MODELO_PARECER = `Em minha qualidade de contador responsável pela revisão dos registros operacionais da cooperativa, analisei os documentos, relatórios de conciliação e trilha de auditoria referentes ao mês indicado.

Com base nos registros disponíveis no sistema HB Cooperativas, manifesto que:

(1) Descreva aqui o resultado da conciliação mensual;
(2) Aponte eventuais ressalvas ou pendências;
(3) Conclusão sobre a adequação dos registros para fins de prestação de contas.

Este parecer não substitui demonstrações contábeis formais exigidas por normas específicas, mas attesta a revisão dos fluxos operacionais registrados no aplicativo.`;

export default function ContadorParecerPage() {
  const data = useAppData();
  const { user, coopId, check } = usePermissions();
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [texto, setTexto] = useState(MODELO_PARECER);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [modalEmissao, setModalEmissao] = useState<"pdf" | "print" | null>(null);

  const meses = useMemo(() => (data ? listMesesConciliacao(data) : [mes]), [data, mes]);
  const parecer = useMemo(() => {
    if (!data || !coopId) return undefined;
    return getParecerContabilMes(data, coopId, mes);
  }, [data, coopId, mes]);

  if (!data || !user || !coopId) return null;

  const podeEditar = check("contador", "export") || user.role === "contador";

  const carregarParecer = () => {
    if (parecer) {
      setTexto(parecer.texto);
      setAssinatura(parecer.assinaturaDataUrl ?? null);
    } else {
      setTexto(MODELO_PARECER);
      setAssinatura(null);
    }
  };

  const handleMesChange = (novoMes: string) => {
    setMes(novoMes);
    const p = getParecerContabilMes(data, coopId, novoMes);
    if (p) {
      setTexto(p.texto);
      setAssinatura(p.assinaturaDataUrl ?? null);
    } else {
      setTexto(MODELO_PARECER);
      setAssinatura(null);
    }
  };

  const salvar = (comAssinatura = false) => {
    if (!texto.trim()) return;
    updateData((d) =>
      salvarParecerContabil(
        d,
        user,
        coopId,
        mes,
        texto,
        comAssinatura ? assinatura ?? undefined : parecer?.assinaturaDataUrl
      )
    );
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  const emitir = (emissor: EmissorRelatorio) => {
    const p = getParecerContabilMes(data, coopId, mes);
    if (!p) return;
    const html = gerarRelatorioParecerContabilHtml(data, p, emissor);
    if (modalEmissao === "print") imprimirDocumentoHtml(html);
    else void baixarDocumento(html, nomeArquivoRelatorio("parecer-contabil", mes));
    setModalEmissao(null);
  };

  return (
    <ContadorAccessGuard>
      <PageHeader
        title="Parecer contábil mensal"
        subtitle={formatMesReferencia(mes)}
        action={
          <div className="flex flex-wrap gap-2 items-end">
            <FormField label="Mês">
              <Select value={mes} onChange={(e) => handleMesChange(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {formatMesReferencia(m)}
                  </option>
                ))}
              </Select>
            </FormField>
            {parecer && check("contador", "export") && (
              <>
                <Button variant="secondary" onClick={() => setModalEmissao("print")}>
                  <Printer size={16} /> Imprimir
                </Button>
                <Button onClick={() => setModalEmissao("pdf")}>
                  <Download size={16} /> PDF
                </Button>
              </>
            )}
          </div>
        }
      />

      {salvo && (
        <AlertBanner variant="success" title="Parecer salvo" className="mb-4">
          O parecer de {formatMesReferencia(mes)} foi registrado na trilha de auditoria.
        </AlertBanner>
      )}

      <Card className="mb-4">
        <p className="text-sm text-gray-600 mb-4">
          Registre sua opinião profissional sobre os registros do mês. Recomenda-se emitir após revisar a conciliação em{" "}
          <strong>/contador/conciliacao</strong>.
        </p>

        {!parecer && (
          <Button variant="secondary" size="sm" className="mb-4" onClick={carregarParecer}>
            Usar modelo padrão
          </Button>
        )}

        <FormField label="Texto do parecer (R9)">
          <Textarea
            rows={14}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!podeEditar}
          />
        </FormField>

        {podeEditar && (
          <>
            <div className="mt-6">
              <p className="text-sm font-medium text-gray-900 mb-2">Assinatura do contador</p>
              <SignaturePad onChange={setAssinatura} />
            </div>

            <div className="flex flex-wrap gap-2 mt-6">
              <Button onClick={() => salvar(false)}>Salvar rascunho</Button>
              <Button onClick={() => salvar(true)} disabled={!assinatura}>
                <FileCheck size={16} /> Salvar com assinatura
              </Button>
            </div>
          </>
        )}
      </Card>

      {modalEmissao && parecer && (
        <ModalEmitirRelatorio
          open
          titulo="Emitir parecer contábil"
          user={user}
          onClose={() => setModalEmissao(null)}
          onConfirm={emitir}
        />
      )}
    </ContadorAccessGuard>
  );
}
