"use client";

import { useMemo, useState } from "react";
import { Camera, ChevronDown } from "lucide-react";
import { useAppDataSnapshotForDomains } from "@/hooks/useAppData";
import { Button } from "@/components/ui/Button";
import { CooperadoHistoricoPagamentoMes } from "@/components/cooperado/CooperadoHistoricoPagamentoMes";
import { CooperadoMesEntregasDetalhe } from "@/components/cooperado/CooperadoMesEntregasDetalhe";
import { CooperadoMesItensConsolidadosTable } from "@/components/cooperado/CooperadoMesItensConsolidadosTable";
import { agregarItensFichaMes } from "@/services/notaPedidoService";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import { notaTemFotoEnviadaCooperado } from "@/services/cooperadoEntregasService";
import { normalizeCnpj } from "@/utils/cooperativa";
import { baixarRecibo, nomeArquivoRecibo } from "@/utils/recibo";
import { cn } from "@/utils/format";

type Props = {
  resumo: ResumoMesEntregasCooperado;
  cooperadoId: string;
  cooperativaId?: string;
  nomeCooperado: string;
  getEscolaLabel: (nota: import("@/types").NotaPedido) => string;
  onVerFotosMes?: (mesReferencia: string) => void;
};

export function CooperadoPagamentoMesView({
  resumo,
  cooperadoId,
  cooperativaId,
  nomeCooperado,
  getEscolaLabel,
  onVerFotosMes,
}: Props) {
  const data = useAppDataSnapshotForDomains(["financeiro", "notas"]);
  const [entregasAbertas, setEntregasAbertas] = useState(false);
  const [itensAbertos, setItensAbertos] = useState(false);

  const pagamento = resumo.pagamentoConfirmado ?? resumo.pagamentoAguardando;
  const aguardandoAssinatura =
    pagamento?.status === "aguardando_confirmacao" ||
    (pagamento?.status === "confirmado" && !pagamento.assinaturaCooperado?.trim());
  const coopCnpj = useMemo(() => {
    if (!data || !cooperativaId) return "";
    const coop = data.cooperativas.find((c) => c.id === cooperativaId);
    return normalizeCnpj(coop?.cnpj ?? "");
  }, [data, cooperativaId]);

  const itensMes = useMemo(() => {
    if (!data) return { itens: [], entregas: 0, valorBruto: 0 };
    return agregarItensFichaMes(data, cooperadoId, resumo.mesReferencia, cooperativaId, {
      apenasPendentes: false,
    });
  }, [data, cooperadoId, resumo.mesReferencia, cooperativaId]);

  const temFotos = resumo.notas.some((n) => notaTemFotoEnviadaCooperado(n));

  if (!data) return null;

  return (
    <div className="space-y-6">
      {pagamento ? (
        <CooperadoHistoricoPagamentoMes
          pagamento={pagamento}
          mesReferencia={resumo.mesReferencia}
          descontoPadraoPct={data.config.descontoPadraoCooperativa}
          cnpj={coopCnpj}
          cooperadoId={cooperadoId}
          cooperadoNome={nomeCooperado}
          aguardandoAssinatura={aguardandoAssinatura}
          onBaixarRecibo={
            pagamento.reciboHtml
              ? () =>
                  void baixarRecibo(
                    pagamento.reciboHtml!,
                    nomeArquivoRecibo(resumo.mesReferencia, nomeCooperado)
                  )
              : undefined
          }
        />
      ) : (
        <p className="text-sm text-gray-600 rounded-xl border border-dashed p-4 bg-white">
          Resumo do PIX ainda não disponível neste dispositivo — sincronize e abra de novo. As entregas e itens do mês
          estão abaixo.
        </p>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setEntregasAbertas((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          aria-expanded={entregasAbertas}
        >
          <div>
            <p className="font-semibold text-gray-900">Detalhe das entregas</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Onde e o que foi entregue neste mês
            </p>
          </div>
          <ChevronDown
            size={20}
            className={cn("text-gray-400 shrink-0 transition-transform", entregasAbertas && "rotate-180")}
          />
        </button>
        {entregasAbertas && (
          <div className="border-t border-gray-100 px-5 pb-5 pt-4 bg-gray-50/30">
            <CooperadoMesEntregasDetalhe
              data={data}
              cooperadoId={cooperadoId}
              mesReferencia={resumo.mesReferencia}
              notas={resumo.notas}
              getEscolaLabel={getEscolaLabel}
            />
          </div>
        )}
      </section>

      {itensMes.itens.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setItensAbertos((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            aria-expanded={itensAbertos}
          >
            <div>
              <p className="font-semibold text-gray-900">Relatório por item</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Quantidades e valores somados de todas as entregas
              </p>
            </div>
            <ChevronDown
              size={20}
              className={cn("text-gray-400 shrink-0 transition-transform", itensAbertos && "rotate-180")}
            />
          </button>
          {itensAbertos && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-4">
              <CooperadoMesItensConsolidadosTable
                itens={itensMes.itens}
                entregas={itensMes.entregas}
              />
            </div>
          )}
        </section>
      )}

      {temFotos && onVerFotosMes && (
        <Button type="button" variant="secondary" onClick={() => onVerFotosMes(resumo.mesReferencia)}>
          <Camera size={16} /> Ver fotos deste mês
        </Button>
      )}
    </div>
  );
}
