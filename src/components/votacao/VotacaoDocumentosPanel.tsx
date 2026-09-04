"use client";

import { FileDown, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatDateTime } from "@/utils/format";
import type { ResumoVotacaoPauta } from "@/services/votacaoService";
import { labelEscopoEleitoral, getEscopoEleitoralPauta } from "@/services/votacaoService";

type Props = {
  resumos: ResumoVotacaoPauta[];
  gerandoPdf: string | null;
  onBaixarAta: (pautaId: string) => void;
};

export function VotacaoDocumentosPanel({ resumos, gerandoPdf, onBaixarAta }: Props) {
  const documentos = resumos.filter((r) => r.pauta.status !== "rascunho");

  if (documentos.length === 0) {
    return (
      <Card>
        <p className="text-center text-gray-500 py-12">
          Nenhum documento disponível. Lance uma enquete ou finalize uma votação para gerar atas.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Arquivo de deliberações da cooperativa. Baixe a <strong>ata oficial em PDF</strong> de cada votação com voto
        registrado — inclui apuração, rol nominal e assinaturas digitais.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-semibold">Deliberação</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Período</th>
              <th className="px-4 py-3 font-semibold">Situação</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Votos</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Finalizada</th>
              <th className="px-4 py-3 font-semibold text-right">Documento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {documentos.map((resumo) => {
              const { pauta, totalVotos, totalElegiveis } = resumo;
              const finalizadaEm = pauta.encerradaEm ?? pauta.resultadoPublicadoEm;
              const podeBaixar = totalVotos > 0;

              return (
                <tr key={pauta.id} className="align-top hover:bg-gray-50/80">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-gray-900 leading-snug">{pauta.texto}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {labelEscopoEleitoral(getEscopoEleitoralPauta(pauta))}
                      {pauta.criadoPorNome ? ` · ${pauta.criadoPorNome}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                    {formatDate(pauta.inicioEm)}
                    <br />
                    → {formatDate(pauta.fimEm)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={pauta.status === "aberta" ? "aberta" : pauta.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">
                    {totalVotos}/{totalElegiveis}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                    {finalizadaEm ? formatDateTime(finalizadaEm) : "—"}
                    {pauta.encerradaPorNome && (
                      <span className="block text-gray-400 mt-0.5">por {pauta.encerradaPorNome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {podeBaixar ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onBaixarAta(pauta.id)}
                        disabled={gerandoPdf === pauta.id}
                      >
                        <FileDown size={15} />
                        {gerandoPdf === pauta.id ? "Gerando…" : "Ata PDF"}
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                        <FileText size={14} /> Sem votos
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
