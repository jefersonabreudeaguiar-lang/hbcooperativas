"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { QrCode, XCircle, Wallet, CheckCircle2, FileDown, PenLine, BookOpen, CreditCard, History, Users, ChevronDown, Pencil, RefreshCw, Eye } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  resumoFromPagamento,
  getDescontosExtrasExibicaoCooperado,
  registrarPagamentoCooperado,
  confirmarPagamentoCooperado,
  reenviarSolicitacaoAssinaturaRecibo,
  marcarReciboPagamentoVerificadoResponsavel,
  getPagamentoAguardandoCooperado,
  getMensalidadeFixaMes,
  getStatusCotaCooperado,
  setCotaIngressoCooperado,
  getArquivoMensalCooperado,
  upsertArquivoMensal,
  getAjustesCompartilhadosFichaMes,
  aplicarAjustesFichaMesTodosCooperados,
  upsertAjustesFichaMesCooperativa,
  agregarItensFichaMes,
  agregarItensFichaMeses,
  getResumoPagamentoConsolidadoCooperado,
  getMesesReferenciaPagamento,
} from "@/services/notaPedidoService";
import {
  bicCentralBuildValorExibicaoCooperadoOpts,
  bicCentralGetResumoPagamentoExibicao,
  bicCentralGetValorExibicaoCooperado,
} from "@/services/bicLeituraCentralFicha";
import { listarPagamentosAguardandoAssinatura, listarPagamentosReciboAguardandoVerificacao } from "@/services/filaDoDiaService";
import { listCooperadosPagamentoPendenteResponsavel } from "@/services/responsavelPainelIndex";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";
import { listCooperadosComFichaNoMes, getCooperadoNomeResolvido, resolverCooperadoParaPagamento, fichaPertenceCooperado, listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj, patchNotaPedidoInCloud } from "@/services/notaPedidoCloudService";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import { refreshContaCoopLimiteFromFicha } from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import {
  pushOperacionalToCloud,
  pushNotasPagasToCloud,
  clearOperacionalPushFingerprint,
  confirmarPagamentoCooperadoNaNuvem,
  registrarPagamentoCooperadoNaNuvem,
  syncOperacionalFromCloud,
} from "@/services/cooperativaSyncCloudService";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import {
  bicCentralCooperadoTemValorPendente,
  bicCentralGetConsolidadoFinanceiroCooperado,
  bicCentralListarMesesPendentesQuantoVouReceber,
  bicCentralMesPrincipalQuantoVouReceber,
  bicCentralQuantoVouReceberParaExibicao,
  bicCentralResolvePainelParaExibicao,
} from "@/services/bicLeituraCentralCooperado";
import { cooperadoUsarFluxoReciboAssinaturaNaUi } from "@/lib/bic/cooperadoBicCentralUi";
import {
  cooperadoMesQuitado,
  cooperadoPendentePagamentoResponsavel,
  listarMesesPendentesPagamentoResponsavel,
  getPagamentoConfirmadoMes,
  getPagamentoRegistradoMes,
  listarMesesComPagamentoRegistradoCooperado,
} from "@/services/cooperadoEntregasService";
import { PageHeader, FilterBar, Modal } from "@/components/ui/Table";
import { Select, FormField, Input, Textarea } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { ConfirmDialog, PromptDialog } from "@/components/ui/ConfirmDialog";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { AssinarComCadastroBlock } from "@/components/cooperado/AssinarComCadastroBlock";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PagarStepper } from "@/components/ficha/PagarStepper";
import { ReciboResumoView } from "@/components/ficha/ReciboResumoView";
import { HistoricoHbCreditosResumo } from "@/components/ficha/HistoricoHbCreditosResumo";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import { CooperadoHistoricoPagamentoMes } from "@/components/cooperado/CooperadoHistoricoPagamentoMes";
import { CooperadoQuantoVouReceberPainel } from "@/components/cooperado/CooperadoQuantoVouReceberPainel";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { DivisaoEntregaModal } from "@/components/ficha/DivisaoEntregaModal";
import { ValoresAvulsosReceberPanel } from "@/components/ficha/ValoresAvulsosReceberPanel";
import {
  dividirEntregaEntreCooperados,
  nomesParticipantesDivisao,
  textoInformativoDivisaoEntrega,
  isDivisaoEntregaHabilitada,
} from "@/services/divisaoEntregaService";
import { descontosDoCooperadoNoMes, TIPO_DESCONTO_LABELS, descontoManualDuplicaContaCoop } from "@/services/descontosService";
import {
  criarValorAvulsoReceber,
  cancelarValorAvulsoReceber,
} from "@/services/valoresAvulsosReceberService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { baixarRecibo, resumoReciboFromPagamento, nomeArquivoRecibo } from "@/utils/recibo";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { isCooperadoManualOperacionalSync } from "@/lib/performance/cooperadoColdStart";
import { requestAppSync, requestAppSyncImmediate } from "@/services/syncRequest";
import { useCooperadoExibirAguardandoAssinatura } from "@/hooks/useCooperadoExibirAguardandoAssinatura";
import { useCooperadoApresentacaoFinanceiraConsolidada } from "@/hooks/useCooperadoApresentacaoFinanceiraConsolidada";
import { cooperadoFluxoPainelProjecaoOpts } from "@/lib/cooperadoFluxoFinanceiroGlobal";
import { formatCurrency, formatDate, formatMesReferencia, formatMesesReferenciaRotulo, getCurrentMesReferencia, cn } from "@/utils/format";
import type { PagamentoCooperadoRegistro, FichaCorrida, NotaPedido } from "@/types";

function TabelaResumoItens({
  itens,
  entregas,
}: {
  itens: ReturnType<typeof agregarItensFichaMes>["itens"];
  entregas: number;
}) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Nenhuma entrega conferida neste mês ainda.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">
        {entregas} entrega{entregas !== 1 ? "s" : ""} no mês · totais consolidados por item
      </p>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-green-700 text-white">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Item</th>
              <th className="text-right px-4 py-2.5 font-semibold w-28">Quantidade</th>
              <th className="text-right px-4 py-2.5 font-semibold w-32">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((i) => (
              <tr key={i.produtoInstituicaoId || `${i.produtoNome}-${i.unidade}`} className="hover:bg-green-50/40">
                <td className="px-4 py-2.5 font-medium text-gray-900">{i.produtoNome}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">
                  {i.quantidade} {i.unidade}
                </td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(i.valorBruto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td className="px-4 py-2.5 font-semibold text-gray-800" colSpan={2}>
                Total bruto dos itens
              </td>
              <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                {formatCurrency(itens.reduce((s, i) => s + i.valorBruto, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function FichaCorridaPage() {
  const data = useAppData();
  const hbDescontosRevision = useContaCoopDescontosRevision();
  const { user, isCooperado, cooperadoId, check } = usePermissions();
  const searchParams = useSearchParams();
  const [mesFilter, setMesFilter] = useState(searchParams.get("mes") ?? getCurrentMesReferencia());
  const [cooperadoFilter, setCooperadoFilter] = useState(searchParams.get("cooperado") ?? "");
  const [aba, setAba] = useState<"ficha" | "pagar">(() => {
    const fila = searchParams.get("fila");
    if (searchParams.get("aba") === "pagar" || fila === "assinaturas" || fila === "verificar-recibos") {
      return "pagar";
    }
    return "ficha";
  });
  const [abaMesCooperado, setAbaMesCooperado] = useState<"aberto" | string>("aberto");
  const [abaMesPagamentoResponsavel, setAbaMesPagamentoResponsavel] = useState<"pendente" | string>("pendente");
  const [pixStepVisited, setPixStepVisited] = useState(false);

  useEffect(() => {
    if (isCooperado && isCooperadoManualOperacionalSync()) return;
    requestAppSync();
  }, [isCooperado]);

  useEffect(() => {
    const c = searchParams.get("cooperado");
    const m = searchParams.get("mes");
    const a = searchParams.get("aba");
    const fila = searchParams.get("fila");
    if (c && !isCooperado) setCooperadoFilter(c);
    if (m) setMesFilter(m);
    if (!isCooperado && (a === "pagar" || fila === "assinaturas" || fila === "verificar-recibos")) setAba("pagar");
  }, [searchParams, isCooperado]);

  useEffect(() => {
    setPixStepVisited(false);
  }, [cooperadoFilter, mesFilter]);

  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [confirmPagamento, setConfirmPagamento] = useState(false);
  const [pixInvalidoOpen, setPixInvalidoOpen] = useState(false);
  const [motivoPix, setMotivoPix] = useState("");
  const [pixEditarOpen, setPixEditarOpen] = useState(false);
  const [chavePixEdit, setChavePixEdit] = useState("");
  const [pagoMsg, setPagoMsg] = useState("");
  const [pagoMsgVariant, setPagoMsgVariant] = useState<"success" | "error">("success");
  const [assinaturaModal, setAssinaturaModal] = useState(false);
  const [reciboSucessoOpen, setReciboSucessoOpen] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState<PagamentoCooperadoRegistro | null>(null);

  const [mensalidadeInput, setMensalidadeInput] = useState("");
  const [descontoAvulsoInput, setDescontoAvulsoInput] = useState("");
  const [descontoAvulsoMotivo, setDescontoAvulsoMotivo] = useState("");
  const [avulsoReceberMotivo, setAvulsoReceberMotivo] = useState("");
  const [avulsoReceberValor, setAvulsoReceberValor] = useState("");
  const [avulsoReceberData, setAvulsoReceberData] = useState(() => new Date().toISOString().split("T")[0]);
  const [divisaoFicha, setDivisaoFicha] = useState<FichaCorrida | null>(null);
  const [divisaoSelecionados, setDivisaoSelecionados] = useState<string[]>([]);
  const [divisaoSalvando, setDivisaoSalvando] = useState(false);
  const [lancamentosPagarExpandido, setLancamentosPagarExpandido] = useState(false);
  const [historicoEntregasExpandido, setHistoricoEntregasExpandido] = useState(false);
  const [assinaturaBusyId, setAssinaturaBusyId] = useState<string | null>(null);
  const [coopCnpjResumo, setCoopCnpjResumo] = useState("");

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const fluxoReciboAssinatura = cooperadoUsarFluxoReciboAssinaturaNaUi();
  const { apresentacaoConsolidada, carregandoValoresFinanceiros } =
    useCooperadoApresentacaoFinanceiraConsolidada();

  useEffect(() => {
    if (!data || !coopId || !user) {
      setCoopCnpjResumo("");
      return;
    }
    let cancel = false;
    void resolveCooperativaCnpj(data, coopId, user).then((c) => {
      if (!cancel) setCoopCnpjResumo(c ?? "");
    });
    return () => {
      cancel = true;
    };
  }, [data, coopId, user?.id]);

  const mesEmAberto = useMemo(() => {
    if (!data || !cooperadoId) return getCurrentMesReferencia();
    return bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, coopId, { apresentacaoConsolidada });
  }, [data, cooperadoId, coopId, hbDescontosRevision, apresentacaoConsolidada]);

  const valorReceberConsolidado = useMemo(() => {
    if (!data || !cooperadoId) return null;
    return bicCentralQuantoVouReceberParaExibicao(data, cooperadoId, coopId, {
      apresentacaoConsolidada,
    }).value;
  }, [data, cooperadoId, coopId, apresentacaoConsolidada, hbDescontosRevision]);

  const mesesPendentesQuantoVouReceber = useMemo(() => {
    if (!data || !cooperadoId || !isCooperado) return [];
    return bicCentralListarMesesPendentesQuantoVouReceber(data, cooperadoId, coopId, {
      apresentacaoConsolidada,
    });
  }, [cooperadoId, coopId, data, isCooperado, hbDescontosRevision]);

  const mesesHistoricoPagamentoCooperado = useMemo(() => {
    if (!data || !cooperadoId) return [];
    return listarMesesComPagamentoRegistradoCooperado(data, cooperadoId, coopId);
  }, [data, cooperadoId, coopId]);

  const mesesHistoricoPagamentoResponsavel = useMemo(() => {
    if (!data || !coopId || isCooperado || !cooperadoFilter) return [];
    return listarMesesComPagamentoRegistradoCooperado(data, cooperadoFilter, coopId);
  }, [coopId, cooperadoFilter, data, isCooperado]);

  const visualizandoHistorico = isCooperado && abaMesCooperado !== "aberto";
  const visualizandoHistoricoPagamentoResponsavel =
    !isCooperado && aba === "pagar" && abaMesPagamentoResponsavel !== "pendente";

  const mesAtivo = isCooperado
    ? visualizandoHistorico
      ? abaMesCooperado
      : mesEmAberto
    : visualizandoHistoricoPagamentoResponsavel
      ? abaMesPagamentoResponsavel
      : mesFilter;

  const mesAtivoExibicao = mesAtivo;

  useEffect(() => {
    if (!isCooperado) return;
    if (searchParams.get("mes")) {
      const m = searchParams.get("mes")!;
      if (mesesHistoricoPagamentoCooperado.includes(m)) {
        setAbaMesCooperado(m);
      }
    }
  }, [isCooperado, searchParams, mesesHistoricoPagamentoCooperado]);

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    const set = new Set(data.fichaCorrida.map((f) => f.mesReferencia));
    set.add(getCurrentMesReferencia());
    return [...set].sort().reverse();
  }, [data]);

  const cooperadosComFicha = useMemo(() => {
    if (!data || !coopId) return [];
    return listCooperadosComFichaNoMes(data, coopId, mesAtivo);
  }, [data, coopId, mesAtivo]);

  const cooperadosParaPagar = useMemo(() => {
    if (!data || !coopId) return [];
    return listCooperadosPagamentoPendenteResponsavel(data, coopId);
  }, [data, coopId]);

  const pagamentosAguardandoAssinatura = useMemo(() => {
    if (!data || !coopId) return [];
    return listarPagamentosAguardandoAssinatura(data, coopId);
  }, [data, coopId]);

  const pagamentosAguardandoVerificacao = useMemo(() => {
    if (!data || !coopId) return [];
    return listarPagamentosReciboAguardandoVerificacao(data, coopId);
  }, [data, coopId]);

  const totalBadgeFilaPagar = useMemo(() => {
    const aguard = pagamentosAguardandoAssinatura.length;
    const verif = pagamentosAguardandoVerificacao.length;
    const restoreAtivo = Boolean(coopCnpjResumo && isOperacionalCloudAuthoritative(coopCnpjResumo));
    if (restoreAtivo) {
      return aguard + verif;
    }
    return cooperadosParaPagar.length + aguard + verif;
  }, [
    coopCnpjResumo,
    cooperadosParaPagar,
    pagamentosAguardandoAssinatura,
    pagamentosAguardandoVerificacao,
  ]);

  const cooperadosNoSelect = !isCooperado && aba === "pagar" ? cooperadosParaPagar : cooperadosComFicha;

  useEffect(() => {
    if (isCooperado || aba !== "pagar" || !cooperadoFilter || !data || !coopId) return;
    if (!cooperadoPendentePagamentoResponsavel(data, cooperadoFilter, undefined, coopId)) {
      setCooperadoFilter("");
    }
  }, [isCooperado, aba, cooperadoFilter, data, coopId, mesAtivo]);

  useEffect(() => {
    setAbaMesPagamentoResponsavel("pendente");
  }, [cooperadoFilter, aba]);

  const cooperadoSelecionadoId = isCooperado ? cooperadoId : cooperadoFilter;

  const financeiroAberto = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return null;
    return bicCentralGetConsolidadoFinanceiroCooperado(data, cooperadoSelecionadoId, coopId);
  }, [data, cooperadoSelecionadoId, coopId, hbDescontosRevision]);

  const mesesPendentesPagamento = useMemo(() => {
    if (!data || !cooperadoSelecionadoId || isCooperado) return [];
    return listarMesesPendentesPagamentoResponsavel(data, cooperadoSelecionadoId, coopId);
  }, [coopId, cooperadoSelecionadoId, data, isCooperado]);

  const resumoPagamentoConsolidado = useMemo(() => {
    if (!data || !cooperadoSelecionadoId || isCooperado || !mesesPendentesPagamento.length) return null;
    return getResumoPagamentoConsolidadoCooperado(data, cooperadoSelecionadoId, mesesPendentesPagamento, coopId);
  }, [coopId, cooperadoSelecionadoId, data, isCooperado, mesesPendentesPagamento]);

  useEffect(() => {
    setLancamentosPagarExpandido(false);
    setHistoricoEntregasExpandido(false);
  }, [cooperadoSelecionadoId, mesAtivo, aba]);

  const cooperadoSelecionado = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return (
      resolverCooperadoParaPagamento(data, cooperadoSelecionadoId, coopId) ??
      data.cooperados.find((c) => c.id === cooperadoSelecionadoId) ??
      cooperadosComFicha.find((c) => c.id === cooperadoSelecionadoId)
    );
  }, [data, cooperadoSelecionadoId, cooperadosComFicha, coopId]);

  const nomeCooperado = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return "";
    return getCooperadoNomeResolvido(data, cooperadoSelecionadoId, coopId);
  }, [data, cooperadoSelecionadoId, coopId]);

  const arquivoMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return getArquivoMensalCooperado(data, cooperadoSelecionadoId, mesAtivo, coopId);
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

  const ajustesCompartilhadosMes = useMemo(() => {
    if (!data || !coopId) return undefined;
    return getAjustesCompartilhadosFichaMes(data, coopId, mesAtivo);
  }, [data, coopId, mesAtivo]);

  const mensalidadePadrao = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return 0;
    return getMensalidadeFixaMes(data, cooperadoSelecionadoId, mesAtivo, coopId);
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

  const statusCota = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return "sem_cota" as const;
    return getStatusCotaCooperado(data, cooperadoSelecionadoId, mesAtivo);
  }, [data, cooperadoSelecionadoId, mesAtivo]);

  useEffect(() => {
    if (!coopId || !data) return;
    if (isCooperado) {
      if (!cooperadoSelecionadoId) return;
      setMensalidadeInput(String(mensalidadePadrao || ""));
      setDescontoAvulsoInput(String(arquivoMes?.descontoAvulso ?? ajustesCompartilhadosMes?.descontoAvulso ?? ""));
      setDescontoAvulsoMotivo(arquivoMes?.descontoAvulsoMotivo ?? ajustesCompartilhadosMes?.descontoAvulsoMotivo ?? "");
      return;
    }
    const mensalidade =
      ajustesCompartilhadosMes?.mensalidadeFixa ??
      (cooperadoSelecionadoId
        ? getMensalidadeFixaMes(data, cooperadoSelecionadoId, mesAtivo, coopId)
        : data.cooperativas.find((c) => c.id === coopId)?.mensalidadeConfig?.valorPadrao ?? 0);
    setMensalidadeInput(String(mensalidade ?? ""));
    setDescontoAvulsoInput(String(ajustesCompartilhadosMes?.descontoAvulso ?? ""));
    setDescontoAvulsoMotivo(ajustesCompartilhadosMes?.descontoAvulsoMotivo ?? "");
  }, [
    isCooperado,
    cooperadoSelecionadoId,
    mesAtivo,
    mensalidadePadrao,
    arquivoMes,
    ajustesCompartilhadosMes,
    coopId,
    data,
  ]);

  const salvarAjustesFicha = useCallback(() => {
    if (!user || !data || !coopId || isCooperado) return;
    const mensalidadeFixa = parseFloat(mensalidadeInput.replace(",", ".")) || 0;
    const descontoAvulso = parseFloat(descontoAvulsoInput.replace(",", ".")) || 0;
    const patch = {
      mensalidadeFixa,
      descontoAvulso,
      descontoAvulsoMotivo: descontoAvulsoMotivo.trim() || undefined,
    };
    updateData((d) => {
      const ajustesFichaMes = upsertAjustesFichaMesCooperativa(d, coopId, mesAtivo, patch);
      return addAuditEntry(
        {
          ...d,
          ajustesFichaMes,
          arquivosMensais: aplicarAjustesFichaMesTodosCooperados({ ...d, ajustesFichaMes }, coopId, mesAtivo, patch),
        },
        {
          entityType: "ficha_corrida",
          entityId: coopId,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: `Mensalidade e desconto avulso de ${formatMesReferencia(mesAtivo)} aplicados a todos os cooperados`,
        }
      );
    });
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
    })();
  }, [user, data, coopId, isCooperado, mensalidadeInput, descontoAvulsoInput, descontoAvulsoMotivo, mesAtivo]);

  const pushOperacional = useCallback(() => {
    void (async () => {
      if (!user || !coopId) return;
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
    })();
  }, [user, coopId]);

  const handleLancarAvulsoReceber = useCallback(
    (params: { motivo: string; valor: number; dataLancamento: string }) => {
      if (!user || !coopId || !cooperadoSelecionadoId || isCooperado) return;
      updateData((d) => {
        const next = criarValorAvulsoReceber(d, {
          cooperativaId: coopId,
          cooperadoId: cooperadoSelecionadoId,
          mesReferencia: mesAtivo,
          motivo: params.motivo,
          valor: params.valor,
          responsavel: user.name,
          dataLancamento: params.dataLancamento,
        });
        return addAuditEntry(next, {
          entityType: "ficha_corrida",
          entityId: cooperadoSelecionadoId,
          action: "criar",
          userId: user.id,
          userName: user.name,
          changes: `Valor avulso a receber: ${formatCurrency(params.valor)} · ${params.motivo}`,
        });
      });
      setAvulsoReceberMotivo("");
      setAvulsoReceberValor("");
      setAvulsoReceberData(new Date().toISOString().split("T")[0]);
      pushOperacional();
    },
    [user, coopId, cooperadoSelecionadoId, isCooperado, mesAtivo, pushOperacional]
  );

  const handleRemoverAvulsoReceber = useCallback(
    (id: string) => {
      if (!user || isCooperado) return;
      updateData((d) =>
        addAuditEntry(cancelarValorAvulsoReceber(d, id), {
          entityType: "ficha_corrida",
          entityId: id,
          action: "excluir",
          userId: user.id,
          userName: user.name,
          changes: "Valor avulso a receber removido",
        })
      );
      pushOperacional();
    },
    [user, isCooperado, pushOperacional]
  );

  const confirmarCotaIngressoPaga = useCallback(() => {
    if (!user || !cooperadoSelecionadoId || !coopId || isCooperado) return;
    if (!check("ficha_corrida", "edit")) return;
    if (getStatusCotaCooperado(getData(), cooperadoSelecionadoId, mesAtivo) === "paga") return;

    const next = updateData((d) =>
      addAuditEntry(setCotaIngressoCooperado(d, cooperadoSelecionadoId, coopId, mesAtivo, true), {
        entityType: "cooperado",
        entityId: cooperadoSelecionadoId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: `Cota de ingresso · ${formatMesReferencia(mesAtivo)} · paga`,
      })
    );

    void (async () => {
      const cnpj = await resolveCooperativaCnpj(next, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, next, coopId, { authoritative: true });
    })();
  }, [user, cooperadoSelecionadoId, coopId, isCooperado, mesAtivo, check]);

  const blocoCotaIngressoResponsavel =
    !isCooperado && cooperadoSelecionadoId && check("ficha_corrida", "edit") ? (
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {statusCota === "paga" ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
            <CheckCircle2 size={14} /> Cota paga · {formatMesReferencia(mesAtivo)}
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
              Cota não paga · {formatMesReferencia(mesAtivo)}
            </span>
            <Button size="sm" variant="secondary" onClick={confirmarCotaIngressoPaga}>
              Confirmar cota paga
            </Button>
          </>
        )}
      </div>
    ) : null;

  const resumoItensMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return { itens: [], entregas: 0, valorBruto: 0 };
    return agregarItensFichaMes(data, cooperadoSelecionadoId, mesAtivo, coopId);
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

  const fichasPendentesMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return [];
    const meses =
      isCooperado && !visualizandoHistorico && mesesPendentesQuantoVouReceber.length > 1
        ? mesesPendentesQuantoVouReceber
        : !isCooperado && aba === "pagar" && mesesPendentesPagamento.length
          ? mesesPendentesPagamento
          : [mesAtivo];
    return data.fichaCorrida.filter(
      (f) =>
        fichaPertenceCooperado(data, f, cooperadoSelecionadoId, coopId) &&
        meses.includes(f.mesReferencia) &&
        f.status === "pendente"
    );
  }, [
    data,
    cooperadoSelecionadoId,
    mesAtivo,
    coopId,
    isCooperado,
    aba,
    mesesPendentesPagamento,
    mesesPendentesQuantoVouReceber,
    visualizandoHistorico,
  ]);

  const cooperadosParaDivisao = useMemo(() => {
    if (!data || !coopId || !cooperadoSelecionadoId) return [];
    return listCooperadosDaCooperativa(data, coopId).filter((c) => c.id !== cooperadoSelecionadoId);
  }, [data, coopId, cooperadoSelecionadoId]);

  const notaDivisaoAtual = useMemo(() => {
    if (!data || !divisaoFicha) return undefined;
    return data.notasPedido.find((n) => n.id === divisaoFicha.notaPedidoId);
  }, [data, divisaoFicha]);

  const resumoAjustes = useMemo(() => {
    if (isCooperado) return undefined;
    return {
      mensalidadeFixa: parseFloat(mensalidadeInput.replace(",", ".")) || 0,
      descontoAvulso: parseFloat(descontoAvulsoInput.replace(",", ".")) || 0,
      descontoAvulsoMotivo: descontoAvulsoMotivo.trim() || undefined,
    };
  }, [isCooperado, mensalidadeInput, descontoAvulsoInput, descontoAvulsoMotivo]);

  const pagamentoAguardando = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return getPagamentoAguardandoCooperado(data, cooperadoSelecionadoId);
  }, [data, cooperadoSelecionadoId]);

  const { exibirAguardandoAssinatura, conferindoPagamentoNuvem } =
    useCooperadoExibirAguardandoAssinatura(isCooperado && !!pagamentoAguardando);
  const { syncingForUi: syncCooperadoFinanceiro, cooperadoPagamentosHydrated } = useSyncStatus();

  const pagamentoAguardandoExibicao = useMemo(() => {
    if (!fluxoReciboAssinatura) return undefined;
    if (!isCooperado) {
      if (visualizandoHistoricoPagamentoResponsavel) return undefined;
      return pagamentoAguardando;
    }
    if (!pagamentoAguardando || !exibirAguardandoAssinatura) return undefined;
    if (abaMesCooperado === "aberto") return undefined;
    const mesesPg = getMesesReferenciaPagamento(pagamentoAguardando);
    if (!mesesPg.includes(abaMesCooperado)) return undefined;
    return pagamentoAguardando;
  }, [
    fluxoReciboAssinatura,
    isCooperado,
    pagamentoAguardando,
    exibirAguardandoAssinatura,
    abaMesCooperado,
    visualizandoHistoricoPagamentoResponsavel,
  ]);

  useEffect(() => {
    if (!isCooperado || !fluxoReciboAssinatura || searchParams.get("assinar") !== "1") return;
    if (pagamentoAguardandoExibicao) setAssinaturaModal(true);
  }, [isCooperado, fluxoReciboAssinatura, searchParams, pagamentoAguardandoExibicao]);

  const resumoItensPagamento = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return resumoItensMes;
    if (pagamentoAguardandoExibicao) {
      return agregarItensFichaMeses(
        data,
        cooperadoSelecionadoId,
        getMesesReferenciaPagamento(pagamentoAguardandoExibicao),
        coopId
      );
    }
    if (!isCooperado && mesesPendentesPagamento.length > 1) {
      return agregarItensFichaMeses(data, cooperadoSelecionadoId, mesesPendentesPagamento, coopId, {
        apenasPendentes: true,
      });
    }
    if (!isCooperado && mesesPendentesPagamento.length === 1) {
      return agregarItensFichaMes(data, cooperadoSelecionadoId, mesesPendentesPagamento[0], coopId, {
        apenasPendentes: true,
      });
    }
    return resumoItensMes;
  }, [
    coopId,
    data,
    cooperadoSelecionadoId,
    isCooperado,
    mesesPendentesPagamento,
    pagamentoAguardandoExibicao,
    resumoItensMes,
  ]);

  const pagamentoConfirmadoMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return getPagamentoConfirmadoMes(data, cooperadoSelecionadoId, mesAtivoExibicao);
  }, [data, cooperadoSelecionadoId, mesAtivoExibicao]);

  const pagamentoRegistradoMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return getPagamentoRegistradoMes(data, cooperadoSelecionadoId, mesAtivoExibicao);
  }, [data, cooperadoSelecionadoId, mesAtivoExibicao]);

  const cooperadoVistaMesHistorico =
    (isCooperado && visualizandoHistorico && !!pagamentoRegistradoMes) ||
    (visualizandoHistoricoPagamentoResponsavel && !!pagamentoRegistradoMes);

  const exibicaoOpts = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return bicCentralBuildValorExibicaoCooperadoOpts(data, cooperadoSelecionadoId, mesAtivo, coopId);
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

  useSyncContaCoopValorReceberPilot(
    exibicaoOpts && cooperadoSelecionadoId && coopId
      ? {
          cooperadoId: cooperadoSelecionadoId,
          mesReferencia: mesAtivo,
          cooperativaId: coopId,
          cooperadoNome: exibicaoOpts.cooperadoNome,
          user,
        }
      : undefined
  );

  const resumo = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return null;
    if (isCooperado && !visualizandoHistorico && conferindoPagamentoNuvem) {
      if (financeiroAberto && (financeiroAberto.valorLiquido ?? 0) > 0) {
        return financeiroAberto.resumo;
      }
      return bicCentralGetResumoPagamentoExibicao(
        data,
        cooperadoSelecionadoId,
        mesAtivo,
        coopId,
        ajustesCompartilhadosMes
      );
    }
    if (isCooperado && !visualizandoHistorico && financeiroAberto) {
      if ((financeiroAberto.valorLiquido ?? 0) > 0) {
        return financeiroAberto.resumo;
      }
      if (financeiroAberto.aguardandoAssinatura && pagamentoAguardandoExibicao && fluxoReciboAssinatura) {
        return resumoFromPagamento(pagamentoAguardandoExibicao);
      }
    }
    if (pagamentoConfirmado && (!isCooperado || visualizandoHistorico)) {
      return resumoFromPagamento(pagamentoConfirmado);
    }
    const aguardandoResumo = fluxoReciboAssinatura
      ? isCooperado
        ? pagamentoAguardandoExibicao
        : pagamentoAguardando
      : undefined;
    if (aguardandoResumo) {
      const temEntregaNova =
        isCooperado &&
        !visualizandoHistorico &&
        (valorReceberConsolidado?.valor ?? 0) > 0;
      if (!temEntregaNova) return resumoFromPagamento(aguardandoResumo);
    }
    if (visualizandoHistorico && pagamentoConfirmadoMes) {
      return resumoFromPagamento(pagamentoConfirmadoMes);
    }
    if (!isCooperado && financeiroAberto && !pagamentoAguardando) {
      return financeiroAberto.resumo;
    }
    if (!isCooperado && resumoPagamentoConsolidado) {
      return resumoPagamentoConsolidado;
    }
    if (isCooperado && !visualizandoHistorico && financeiroAberto) {
      return financeiroAberto.resumo;
    }
    return bicCentralGetResumoPagamentoExibicao(
      data,
      cooperadoSelecionadoId,
      mesAtivo,
      coopId,
      isCooperado ? ajustesCompartilhadosMes : resumoAjustes
    );
  }, [
    data,
    cooperadoSelecionadoId,
    mesAtivo,
    coopId,
    resumoAjustes,
    isCooperado,
    ajustesCompartilhadosMes,
    pagamentoAguardando,
    pagamentoAguardandoExibicao,
    pagamentoConfirmado,
    visualizandoHistorico,
    pagamentoConfirmadoMes,
    resumoPagamentoConsolidado,
    mesesPendentesQuantoVouReceber,
    financeiroAberto,
    hbDescontosRevision,
    valorReceberConsolidado?.valor,
    conferindoPagamentoNuvem,
  ]);

  const resumoExibicao = resumo;

  const totalPendente = isCooperado
    ? visualizandoHistorico
      ? resumoExibicao && exibicaoOpts
        ? bicCentralGetValorExibicaoCooperado(resumoExibicao, exibicaoOpts)
        : 0
      : !apresentacaoConsolidada
        ? 0
        : (financeiroAberto?.valorLiquido ?? valorReceberConsolidado?.valor ?? 0)
    : visualizandoHistorico
      ? resumoExibicao && exibicaoOpts
        ? bicCentralGetValorExibicaoCooperado(resumoExibicao, exibicaoOpts)
        : 0
      : (financeiroAberto?.valorLiquido ?? 0);

  const descontosExtrasCooperado =
    isCooperado && resumoExibicao
      ? !visualizandoHistorico && financeiroAberto?.resumo
        ? financeiroAberto.resumo.descontosExtras
        : visualizandoHistorico
          ? resumoExibicao.descontosExtras
          : exibicaoOpts
            ? getDescontosExtrasExibicaoCooperado(resumoExibicao, exibicaoOpts)
            : resumoExibicao.descontosExtras
      : [];

  const pagarStep: 1 | 2 | 3 | 4 = (isCooperado ? pagamentoAguardandoExibicao : pagamentoAguardando)
    ? 4
    : confirmPagamento
      ? 3
      : pixStepVisited || pixModalOpen
        ? 2
        : 1;
  const totalExibido =
    visualizandoHistorico && pagamentoConfirmadoMes
      ? pagamentoConfirmadoMes.valorLiquido
      : totalPendente;

  const resumoQuantoVouReceber = useMemo(() => {
    if (!data || !cooperadoId || !isCooperado) return null;
    return bicCentralResolvePainelParaExibicao(data, cooperadoId, coopId, {
      ...cooperadoFluxoPainelProjecaoOpts({
        role: user?.role,
        syncing: syncCooperadoFinanceiro,
        cooperadoPagamentosHydrated,
        conferindoPagamentoNuvem: conferindoPagamentoNuvem,
      }),
      apresentacaoConsolidada,
    });
  }, [
    data,
    cooperadoId,
    coopId,
    isCooperado,
    conferindoPagamentoNuvem,
    syncCooperadoFinanceiro,
    cooperadoPagamentosHydrated,
    user?.role,
    apresentacaoConsolidada,
  ]);

  const pendentePagamentoResponsavel = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return false;
    return cooperadoPendentePagamentoResponsavel(data, cooperadoSelecionadoId, undefined, coopId);
  }, [data, cooperadoSelecionadoId, coopId]);

  const resumoItensExibicao = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return resumoItensMes;
    if (!isCooperado && aba === "pagar") return resumoItensPagamento;
    if (
      !visualizandoHistorico &&
      (pendentePagamentoResponsavel ||
        (isCooperado ? pagamentoAguardandoExibicao : pagamentoAguardando) ||
        (isCooperado && (valorReceberConsolidado?.valor ?? 0) > 0))
    ) {
      if (isCooperado && mesesPendentesQuantoVouReceber.length > 1) {
        return agregarItensFichaMeses(data, cooperadoSelecionadoId, mesesPendentesQuantoVouReceber, coopId, {
          apenasPendentes: true,
        });
      }
      if (!isCooperado && mesesPendentesPagamento.length > 1) {
        return agregarItensFichaMeses(data, cooperadoSelecionadoId, mesesPendentesPagamento, coopId, {
          apenasPendentes: true,
        });
      }
      return agregarItensFichaMes(data, cooperadoSelecionadoId, mesAtivo, coopId, { apenasPendentes: true });
    }
    return resumoItensMes;
  }, [
    aba,
    coopId,
    cooperadoSelecionadoId,
    data,
    isCooperado,
    mesAtivo,
    mesesPendentesPagamento,
    mesesPendentesQuantoVouReceber,
    pagamentoAguardando,
    pagamentoAguardandoExibicao,
    pendentePagamentoResponsavel,
    resumoItensMes,
    resumoItensPagamento,
    valorReceberConsolidado?.valor,
    visualizandoHistorico,
  ]);

  const descontosRegistradosMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return [];
    const lista = descontosDoCooperadoNoMes(data, cooperadoSelecionadoId, mesAtivo);
    const temContaCoopNoResumo = (resumoExibicao?.descontosExtras ?? []).some((d) => d.tipo === "conta_coop");
    if (!temContaCoopNoResumo) return lista;
    return lista.filter((d) => !descontoManualDuplicaContaCoop(d));
  }, [data, cooperadoSelecionadoId, mesAtivo, resumoExibicao?.descontosExtras]);

  const resumoReciboPagamento = useMemo(() => {
    const pg = isCooperado ? pagamentoAguardandoExibicao : pagamentoAguardando;
    if (!pg) return null;
    return resumoReciboFromPagamento(pg, resumoItensPagamento);
  }, [isCooperado, pagamentoAguardando, pagamentoAguardandoExibicao, resumoItensPagamento]);

  const handlePixInvalido = () => {
    if (!cooperadoSelecionado || !user || !motivoPix.trim()) return;
    updateData((d) => {
      const updated = {
        ...d,
        cooperados: d.cooperados.map((c) =>
          c.id === cooperadoSelecionado.id
            ? { ...c, pixValido: false, pixInvalidoMotivo: motivoPix.trim(), updatedAt: new Date().toISOString() }
            : c
        ),
      };
      return addAuditEntry(updated, {
        entityType: "cooperado", entityId: cooperadoSelecionado.id, action: "editar",
        userId: user.id, userName: user.name, changes: `PIX inválido: ${motivoPix.trim()}`,
      });
    });
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      const coop = d.cooperados.find((c) => c.id === cooperadoSelecionado.id);
      if (cnpj && coop) await pushCooperadoToCloud(cnpj, coop);
    })();
    setPixInvalidoOpen(false);
    setMotivoPix("");
  };

  const handleSalvarPixCooperado = () => {
    if (!cooperadoSelecionado || !user || !chavePixEdit.trim()) return;
    const chave = chavePixEdit.trim();
    updateData((d) => {
      const updated = {
        ...d,
        cooperados: d.cooperados.map((c) =>
          c.id === cooperadoSelecionado.id
            ? {
                ...c,
                chavePix: chave,
                pixValido: true,
                pixInvalidoMotivo: undefined,
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
      };
      return addAuditEntry(updated, {
        entityType: "cooperado",
        entityId: cooperadoSelecionado.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Chave PIX atualizada pelo responsável",
      });
    });
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      const coop = d.cooperados.find((c) => c.id === cooperadoSelecionado.id);
      if (cnpj && coop) await pushCooperadoToCloud(cnpj, coop);
    })();
    setPixEditarOpen(false);
    setChavePixEdit("");
  };

  const abrirDivisaoEntrega = (ficha: FichaCorrida) => {
    if (!isDivisaoEntregaHabilitada()) return;
    const nota = data?.notasPedido.find((n) => n.id === ficha.notaPedidoId);
    const divisao = ficha.divisaoEntrega ?? nota?.divisaoEntrega;
    const origemId = divisao?.cooperadoOrigemId ?? ficha.cooperadoId;
    const outros =
      divisao?.participantes.filter((p) => p.cooperadoId !== origemId).map((p) => p.cooperadoId) ?? [];
    setDivisaoSelecionados(outros);
    setDivisaoFicha(ficha);
  };

  const toggleCooperadoDivisao = (cooperadoId: string) => {
    setDivisaoSelecionados((prev) =>
      prev.includes(cooperadoId) ? prev.filter((id) => id !== cooperadoId) : [...prev, cooperadoId]
    );
  };

  const handleConfirmarDivisao = async () => {
    if (!isDivisaoEntregaHabilitada()) return;
    if (!user || !coopId || !divisaoFicha || divisaoSelecionados.length === 0) return;
    setDivisaoSalvando(true);
    try {
      let notaAtualizada: NotaPedido | undefined;
      updateData((d) => {
        const next = dividirEntregaEntreCooperados(
          d,
          divisaoFicha.notaPedidoId,
          divisaoSelecionados,
          coopId
        );
        notaAtualizada = next.notasPedido.find((n) => n.id === divisaoFicha.notaPedidoId);
        return addAuditEntry(next, {
          entityType: "ficha_corrida",
          entityId: divisaoFicha.notaPedidoId,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: `Entrega dividida entre ${1 + divisaoSelecionados.length} cooperados · ${divisaoFicha.descricao}`,
        });
      });
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj && notaAtualizada) await patchNotaPedidoInCloud(cnpj, notaAtualizada);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
      setDivisaoFicha(null);
      setDivisaoSelecionados([]);
    } finally {
      setDivisaoSalvando(false);
    }
  };

  const handleConfirmarPagamento = () => {
    if (!cooperadoSelecionado || !user || !data || !coopId || totalPendente <= 0) return;
    const mesesPagar = mesesPendentesPagamento.length ? mesesPendentesPagamento : [mesAtivo];
    const mesPrincipal = mesesPagar[0];
    const mensalidadeFixa = parseFloat(mensalidadeInput.replace(",", ".")) || 0;
    const descontoAvulso = parseFloat(descontoAvulsoInput.replace(",", ".")) || 0;
    const patch = {
      mensalidadeFixa,
      descontoAvulso,
      descontoAvulsoMotivo: descontoAvulsoMotivo.trim() || undefined,
    };
    const ajustesPorMes = Object.fromEntries(mesesPagar.map((mes) => [mes, patch]));
    const nextData = updateData((d) => {
      let comAjustes = d;
      for (const mes of mesesPagar) {
        const ajustesFichaMes = upsertAjustesFichaMesCooperativa(comAjustes, coopId, mes, patch);
        comAjustes = {
          ...comAjustes,
          ajustesFichaMes,
          arquivosMensais: aplicarAjustesFichaMesTodosCooperados(
            { ...comAjustes, ajustesFichaMes },
            coopId,
            mes,
            patch
          ),
        };
      }
      comAjustes = addAuditEntry(comAjustes, {
        entityType: "ficha_corrida",
        entityId: cooperadoSelecionado.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: `Mensalidade e desconto avulso aplicados · ${formatMesesReferenciaRotulo(mesesPagar)}`,
      });
      const ajustesPorMesInner = Object.fromEntries(mesesPagar.map((mes) => [mes, patch]));
      const resumoPagInner = getResumoPagamentoConsolidadoCooperado(
        comAjustes,
        cooperadoSelecionado.id,
        mesesPagar,
        coopId,
        ajustesPorMesInner
      );
      return addAuditEntry(
        registrarPagamentoCooperado(comAjustes, cooperadoSelecionado.id, mesPrincipal, user.name, resumoPagInner, {
          mesesReferencia: mesesPagar,
        }),
        {
          entityType: "ficha_corrida",
          entityId: cooperadoSelecionado.id,
          action: "aprovar",
          userId: user.id,
          userName: user.name,
          changes: `Pagamento consolidado (${formatMesesReferenciaRotulo(mesesPagar)}): ${formatCurrency(resumoPagInner.valorLiquido)}`,
        }
      );
    });
    void (async () => {
      const cnpj = await resolveCooperativaCnpj(nextData, coopId, user);
      if (!cnpj) {
        setPagoMsgVariant("error");
        setPagoMsg(
          "Pagamento salvo neste aparelho, mas o CNPJ da cooperativa não foi encontrado — não foi possível publicar na nuvem."
        );
        return;
      }
      const pagamento = [...nextData.pagamentosCooperado]
        .filter(
          (p) =>
            p.cooperadoId === cooperadoSelecionado.id &&
            p.cooperativaId === coopId &&
            p.status === "confirmado"
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        )[0];
      if (!pagamento) {
        setPagoMsgVariant("error");
        setPagoMsg("Pagamento local registrado, mas não foi possível identificar o registro para enviar à nuvem.");
        return;
      }
      const arquivosMensais = nextData.arquivosMensais.filter(
        (a) =>
          a.cooperadoId === cooperadoSelecionado.id &&
          a.cooperativaId === coopId &&
          mesesPagar.includes(a.mesReferencia)
      );
      const ajustesFichaMes = nextData.ajustesFichaMes.filter(
        (a) => a.cooperativaId === coopId && mesesPagar.includes(a.mesReferencia)
      );
      const livroCaixa = (nextData.livroCaixa ?? []).filter((l) =>
        l.origemId?.includes(pagamento.id)
      );
      const nuvem = await registrarPagamentoCooperadoNaNuvem(cnpj, {
        pagamento,
        arquivosMensais: arquivosMensais.length ? arquivosMensais : undefined,
        ajustesFichaMes: ajustesFichaMes.length ? ajustesFichaMes : undefined,
        livroCaixa: livroCaixa.length ? livroCaixa : undefined,
      });
      if (!nuvem.ok) {
        setPagoMsgVariant("error");
        setPagoMsg(
          nuvem.error ??
            "Pagamento ficou neste aparelho. A nuvem não aceitou o registro — tente de novo ou fale com o suporte."
        );
        return;
      }
      clearOperacionalPushFingerprint(cnpj, true);
      await pushNotasPagasToCloud(
        cnpj,
        getResumoPagamentoConsolidadoCooperado(
          nextData,
          cooperadoSelecionado.id,
          mesesPagar,
          coopId,
          ajustesPorMes
        ).notaPedidoIds,
        nextData
      );
      await syncOperacionalFromCloud(cnpj);
      await refreshContaCoopLimiteFromFicha({
        cnpj,
        cooperadoId: cooperadoSelecionado.id,
        cooperativaId: coopId,
        cooperadoNome: cooperadoSelecionado.nomeCompleto,
      }).catch(() => {});
      requestAppSync();
      setPagoMsgVariant("success");
      setPagoMsg(
        `Pagamento confirmado! ${formatCurrency(pagamento.valorLiquido)} registrado para ${nomeCooperado.split(" ")[0]}. O recibo já está disponível na ficha.`
      );
    })();
    setConfirmPagamento(false);
    setAbaMesPagamentoResponsavel(mesPrincipal);
    setAba("pagar");
    setPixStepVisited(false);
  };

  const handleEnviarAssinatura = () => {
    if (!pagamentoAguardando || !assinatura || !user) return;
    let pagamentoConfirmadoLocal: PagamentoCooperadoRegistro | undefined;
    updateData((d) => {
      const next = confirmarPagamentoCooperado(d, pagamentoAguardando.id, assinatura);
      const pg = next.pagamentosCooperado.find((p) => p.id === pagamentoAguardando.id);
      if (pg) {
        pagamentoConfirmadoLocal = pg;
        const mesesPg = getMesesReferenciaPagamento(pg);
        const aindaTemValor = bicCentralCooperadoTemValorPendente(next, pg.cooperadoId, coopId);
        if (!aindaTemValor) {
          setPagamentoConfirmado(pg);
          if (mesesPg.length) setAbaMesCooperado(mesesPg[mesesPg.length - 1]!);
        } else {
          setPagamentoConfirmado(null);
        }
      }
      return addAuditEntry(next, {
        entityType: "pagamento", entityId: pagamentoAguardando.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: "Cooperado confirmou pagamento com assinatura",
      });
    });
    void (async () => {
      const pg = pagamentoConfirmadoLocal ?? getData().pagamentosCooperado.find((p) => p.id === pagamentoAguardando.id);
      const cnpj = await resolveCooperativaCnpj(getData(), coopId, user);
      if (cnpj && pg?.status === "confirmado") {
        const confirmNuvem = await confirmarPagamentoCooperadoNaNuvem(cnpj, pg);
        console.info("[H8.17I] confirmação nuvem", {
          ok: confirmNuvem.ok,
          status: confirmNuvem.status,
          code: confirmNuvem.code,
          error: confirmNuvem.error,
        });
        if (confirmNuvem.ok) await syncOperacionalFromCloud(cnpj);
      }
      if (isCooperado && isCooperadoManualOperacionalSync()) {
        requestAppSyncImmediate();
      } else {
        requestAppSync();
      }
    })();
    setAssinaturaModal(false);
    setAssinatura(null);
    setReciboSucessoOpen(true);
  };

  const syncPagamentoOperacional = async () => {
    if (!user || !coopId) return;
    const cnpj = await resolveCooperativaCnpj(getData(), coopId, user);
    if (!cnpj) return;
    clearOperacionalPushFingerprint(cnpj, true);
    await pushOperacionalToCloud(cnpj, getData(), coopId, { authoritative: true, forceOperacionalPush: true });
    requestAppSync();
  };

  const handleReenviarAssinaturaRecibo = (pagamento: PagamentoCooperadoRegistro) => {
    if (!user || !coopId || !data) return;
    setAssinaturaBusyId(pagamento.id);
    updateData((d) => {
      const next = reenviarSolicitacaoAssinaturaRecibo(d, pagamento.id, user.name);
      return addAuditEntry(next, {
        entityType: "pagamento",
        entityId: pagamento.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Solicitação de assinatura do recibo reenviada ao cooperado",
      });
    });
    const nome = getCooperadoNomeResolvido(data, pagamento.cooperadoId, coopId).split(" ")[0];
    void syncPagamentoOperacional()
      .then(() => {
        setPagoMsgVariant("success");
        setPagoMsg(`${nome} verá de novo o pedido de assinatura no início do app.`);
      })
      .finally(() => setAssinaturaBusyId(null));
  };

  const abrirReciboPagamentoResponsavel = (pagamento: PagamentoCooperadoRegistro) => {
    if (!data) return;
    setAba("ficha");
    setCooperadoFilter(pagamento.cooperadoId);
    setMesFilter(pagamento.mesReferencia);
    if (pagamento.reciboHtml) {
      const nome = getCooperadoNomeResolvido(data, pagamento.cooperadoId, coopId);
      void baixarRecibo(pagamento.reciboHtml, nomeArquivoRecibo(pagamento.mesReferencia, nome));
    }
  };

  const handleVerificarReciboAssinado = (pagamento: PagamentoCooperadoRegistro) => {
    if (!user || !coopId || !data) return;
    setAssinaturaBusyId(pagamento.id);
    updateData((d) => {
      const next = marcarReciboPagamentoVerificadoResponsavel(d, pagamento.id, user.id, user.name);
      return addAuditEntry(next, {
        entityType: "pagamento",
        entityId: pagamento.id,
        action: "aprovar",
        userId: user.id,
        userName: user.name,
        changes: "Recibo assinado conferido pelo responsável",
      });
    });
    void syncPagamentoOperacional().finally(() => setAssinaturaBusyId(null));
  };

  const reciboAtual = pagamentoConfirmado ?? pagamentoConfirmadoMes;

  const mesQuitadoCooperado =
    data && cooperadoSelecionadoId ? cooperadoMesQuitado(data, cooperadoSelecionadoId, mesAtivo) : false;
  const exibirQuantoVouReceber =
    !isCooperado ||
    (!!data &&
      !!cooperadoId &&
      (carregandoValoresFinanceiros ||
        (fluxoReciboAssinatura && !!pagamentoAguardandoExibicao) ||
        (fluxoReciboAssinatura && conferindoPagamentoNuvem) ||
        !!pagamentoConfirmado ||
        bicCentralCooperadoTemValorPendente(data, cooperadoId, coopId) ||
        (!fluxoReciboAssinatura && (valorReceberConsolidado?.valor ?? 0) > 0)));

  const exibirRelatorioMes =
    !!cooperadoSelecionadoId &&
    (isCooperado || aba === "ficha") &&
    (visualizandoHistorico
      ? !!pagamentoConfirmadoMes || !!pagamentoConfirmado
      : exibirQuantoVouReceber || !!pagamentoConfirmado);

  const exibirPagamento =
    !!cooperadoSelecionadoId &&
    (isCooperado || aba === "pagar") &&
    (isCooperado
      ? visualizandoHistorico
        ? false
        : exibirQuantoVouReceber
      : visualizandoHistoricoPagamentoResponsavel
        ? false
        : pendentePagamentoResponsavel);

  const baixarReciboAtual = () => {
    const pg = reciboAtual;
    if (!pg?.reciboHtml) return;
    void baixarRecibo(pg.reciboHtml, nomeArquivoRecibo(pg.mesReferencia, nomeCooperado || "cooperado"));
  };

  const baixarReciboMesHistorico = () => {
    const pg = pagamentoConfirmadoMes;
    if (!pg?.reciboHtml) return;
    void baixarRecibo(pg.reciboHtml, nomeArquivoRecibo(pg.mesReferencia, nomeCooperado || "cooperado"));
  };

  if (!data) return <PageSkeleton />;

  const pixOk = cooperadoSelecionado && !cooperadoPrecisaCadastrarPix(cooperadoSelecionado.chavePix, cooperadoSelecionado.pixValido);
  const mostrarPagar = isCooperado || aba === "pagar";

  return (
    <div>
      <PageHeader
        title={isCooperado ? "Financeiro" : "Pagar cooperados"}
        subtitle={
          isCooperado
            ? "Mês em aberto com valores pendentes — meses pagos ficam nas abas ao lado"
            : "Ficha consolidada das entregas; na aba Pagar fica o valor e o PIX"
        }
      />

      {pagoMsg && (
        <AlertBanner variant={pagoMsgVariant} className="mb-4" onDismiss={() => setPagoMsg("")}>
          {pagoMsg}
        </AlertBanner>
      )}

      {isCooperado && fluxoReciboAssinatura && !visualizandoHistorico && conferindoPagamentoNuvem && (
        <AlertBanner variant="info" title="Conferindo pagamento na nuvem" className="mb-4">
          Aguarde alguns segundos com internet — atualizamos o status do recibo antes de pedir assinatura.
        </AlertBanner>
      )}

      <FilterBar>
        {!isCooperado && (
          <FormField label="Cooperado">
            <Select value={cooperadoFilter} onChange={(e) => setCooperadoFilter(e.target.value)} className="min-w-[220px]">
              <option value="">
                {aba === "pagar" ? "Escolha quem pagar..." : "Escolha o cooperado..."}
              </option>
              {cooperadosNoSelect.map((c) => (
                <option key={c.id} value={c.id}>{getCooperadoNomeResolvido(data, c.id, coopId)}</option>
              ))}
            </Select>
          </FormField>
        )}
        {isCooperado ? (
          <div className="flex items-center gap-2 py-1">
            <span className="text-sm text-gray-600">Período:</span>
            <span className="text-sm font-bold text-green-800 bg-green-100 px-3 py-1.5 rounded-full">
              {visualizandoHistorico
                ? formatMesReferencia(mesAtivo)
                : valorReceberConsolidado?.mesLabel ?? "Mês em aberto"}
            </span>
          </div>
        ) : (
          <FormField label="Mês">
            <Select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)} className="min-w-[180px]">
              {meses.map((m) => <option key={m} value={m}>{formatMesReferencia(m)}</option>)}
            </Select>
          </FormField>
        )}
      </FilterBar>

      {isCooperado && (
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setAbaMesCooperado("aberto")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
              abaMesCooperado === "aberto"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Wallet size={16} /> Mês em aberto
          </button>
          {mesesHistoricoPagamentoCooperado.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setAbaMesCooperado(m)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                abaMesCooperado === m
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <History size={16} /> {formatMesReferencia(m)}
            </button>
          ))}
        </div>
      )}

      {isCooperado &&
        !visualizandoHistorico &&
        pagamentoAguardando &&
        fluxoReciboAssinatura &&
        exibirAguardandoAssinatura && (
          <AlertBanner variant="info" className="mb-6" title="Valor pago neste período">
            O PIX já foi registrado. Abra a aba{" "}
            <strong>
              {formatMesReferencia(getMesesReferenciaPagamento(pagamentoAguardando)[0] ?? mesEmAberto)}
            </strong>{" "}
            para ver o valor pago e assinar o recibo.
          </AlertBanner>
        )}

      {isCooperado && !visualizandoHistorico && mesQuitadoCooperado && (!pagamentoAguardando || !fluxoReciboAssinatura) && (
        <div className="text-center py-14 px-6 bg-white rounded-2xl border border-emerald-200 mb-6">
          <CheckCircle2 size={52} className="mx-auto text-emerald-600 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Pagamento confirmado</h2>
          <p className="text-gray-600 mt-2 max-w-md mx-auto">
            O mês de {formatMesReferencia(mesAtivo)} já foi quitado. Consulte o histórico na aba{" "}
            <strong>{formatMesReferencia(mesAtivo)}</strong> ou veja entregas em{" "}
            <strong>Entregas</strong>.
          </p>
          <Link href="/notas-pedido" className="inline-block mt-6">
            <Button size="lg">
              <History size={18} /> Ver entregas
            </Button>
          </Link>
        </div>
      )}

      {isCooperado &&
        !visualizandoHistorico &&
        resumoQuantoVouReceber?.estado === "carregando" &&
        !mesQuitadoCooperado &&
        !exibirPagamento && (
          <CooperadoQuantoVouReceberPainel
            estado={resumoQuantoVouReceber.estado}
            mesLabel={resumoQuantoVouReceber.mesLabel}
            valorDestaque={0}
            tituloValor={resumoQuantoVouReceber.tituloValor}
            subtitulo={resumoQuantoVouReceber.subtitulo}
            acaoRotulo={null}
          />
        )}

      {isCooperado &&
        !visualizandoHistorico &&
        !exibirQuantoVouReceber &&
        !mesQuitadoCooperado &&
        resumoQuantoVouReceber?.estado !== "carregando" && (
        <div className="text-center py-14 px-6 bg-white rounded-2xl border border-dashed border-gray-300 mb-6">
          <Wallet size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-800">Nada a receber agora</h2>
          <p className="text-sm text-gray-500 mt-2">
            Quando a cooperativa aprovar suas entregas, os valores aparecem aqui automaticamente.
          </p>
          <Link href="/notas-pedido" className="inline-block mt-4">
            <Button variant="secondary">Ver entregas</Button>
          </Link>
        </div>
      )}

      {!isCooperado && (
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setAba("ficha")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${aba === "ficha" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <BookOpen size={16} /> Ficha
          </button>
          <button
            type="button"
            onClick={() => setAba("pagar")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${aba === "pagar" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <CreditCard size={16} /> Pagar
            {(cooperadosParaPagar.length > 0 ||
              pagamentosAguardandoAssinatura.length > 0 ||
              pagamentosAguardandoVerificacao.length > 0) && (
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {totalBadgeFilaPagar}
              </span>
            )}
          </button>
        </div>
      )}

      {!isCooperado && aba === "pagar" && cooperadoFilter && mesesHistoricoPagamentoResponsavel.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setAbaMesPagamentoResponsavel("pendente")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
              abaMesPagamentoResponsavel === "pendente"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <CreditCard size={16} /> A pagar
          </button>
          {mesesHistoricoPagamentoResponsavel.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setAbaMesPagamentoResponsavel(m)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                abaMesPagamentoResponsavel === m
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <History size={16} /> Pago · {formatMesReferencia(m)}
            </button>
          ))}
        </div>
      )}

      {!isCooperado && aba === "pagar" && (
        <div className="mb-6 space-y-4">
          {cooperadoSelecionadoId && !pagamentoAguardando && (
            <PagarStepper currentStep={pagarStep} />
          )}

          {aba === "pagar" && blocoCotaIngressoResponsavel}

          {pagamentosAguardandoAssinatura.length > 0 && (
            <Card
              title={`Falta assinar (${pagamentosAguardandoAssinatura.length})`}
              className="border-violet-200"
            >
              <p className="text-sm text-gray-600 mb-3">
                Pagamento já registrado — o cooperado precisa abrir o app e confirmar o recibo. Use{" "}
                <strong>Reenviar ao cooperado</strong> se ele não estiver vendo o aviso no início do app.
              </p>
              <ul className="space-y-2">
                {pagamentosAguardandoAssinatura.map((p) => {
                  const nome = getCooperadoNomeResolvido(data!, p.cooperadoId, coopId);
                  return (
                    <li
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{nome}</p>
                        <p className="text-xs text-gray-500">
                          {formatMesReferencia(p.mesReferencia)} · pago em {formatDate(p.pagoEm)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-violet-800">{formatCurrency(p.valorLiquido)}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={assinaturaBusyId === p.id}
                          onClick={() => handleReenviarAssinaturaRecibo(p)}
                        >
                          <RefreshCw size={14} /> Reenviar ao cooperado
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setAba("ficha");
                            setCooperadoFilter(p.cooperadoId);
                            setMesFilter(p.mesReferencia);
                          }}
                        >
                          <PenLine size={14} /> Ver ficha
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {pagamentosAguardandoVerificacao.length > 0 && (
            <Card title={`Verificar recibo (${pagamentosAguardandoVerificacao.length})`} className="border-emerald-200">
              <p className="text-sm text-gray-600 mb-3">
                O cooperado já assinou. Confira o recibo e marque como verificado.
              </p>
              <ul className="space-y-2">
                {pagamentosAguardandoVerificacao.map((p) => {
                  const nome = getCooperadoNomeResolvido(data!, p.cooperadoId, coopId);
                  return (
                    <li
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{nome}</p>
                        <p className="text-xs text-gray-500">
                          {formatMesReferencia(p.mesReferencia)}
                          {p.assinadoEm ? ` · assinado em ${formatDate(p.assinadoEm.split("T")[0])}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-emerald-800">{formatCurrency(p.valorLiquido)}</span>
                        <Button size="sm" variant="secondary" onClick={() => abrirReciboPagamentoResponsavel(p)}>
                          <Eye size={14} /> Ver recibo
                        </Button>
                        <Button
                          size="sm"
                          disabled={assinaturaBusyId === p.id}
                          onClick={() => handleVerificarReciboAssinado(p)}
                        >
                          <CheckCircle2 size={14} /> Marcar verificado
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}

      {cooperadoSelecionadoId && !cooperadoVistaMesHistorico && (
        <ValoresAvulsosReceberPanel
          cooperadoId={cooperadoSelecionadoId}
          cooperativaId={coopId}
          mesReferencia={mesAtivo}
          modo={isCooperado ? "cooperado" : "responsavel"}
          filtrarHistoricoPorMes={isCooperado && visualizandoHistorico}
          onLancar={!isCooperado && check("ficha_corrida", "edit") ? handleLancarAvulsoReceber : undefined}
          onRemover={!isCooperado && check("ficha_corrida", "edit") ? handleRemoverAvulsoReceber : undefined}
          lancamentoForm={
            !isCooperado && check("ficha_corrida", "edit")
              ? {
                  motivo: avulsoReceberMotivo,
                  valor: avulsoReceberValor,
                  data: avulsoReceberData,
                  onMotivo: setAvulsoReceberMotivo,
                  onValor: setAvulsoReceberValor,
                  onData: setAvulsoReceberData,
                }
              : undefined
          }
        />
      )}

      {!isCooperado && aba === "pagar" && cooperadosParaPagar.length === 0 && pagamentosAguardandoAssinatura.length === 0 && (
        <AlertBanner variant="success" className="mb-6" title="Nenhum pagamento pendente">
          Todos os cooperados com valor neste mês já tiveram pagamento registrado e assinatura não está pendente.
        </AlertBanner>
      )}

      {!isCooperado && aba === "pagar" && cooperadosParaPagar.length === 0 && pagamentosAguardandoAssinatura.length > 0 && (
        <AlertBanner variant="info" className="mb-6" title="Só falta a assinatura">
          Não há mais PIX a registrar neste mês. Acompanhe quem ainda não assinou na lista acima.
        </AlertBanner>
      )}

      {!isCooperado && aba === "ficha" && cooperadoSelecionadoId && pagamentoConfirmadoMes && (
        <AlertBanner variant="success" className="mb-6" title="Pagamento confirmado">
          {formatCurrency(pagamentoConfirmadoMes.valorLiquido)} · registrado por {pagamentoConfirmadoMes.pagoPor ?? "cooperativa"} em{" "}
          {pagamentoConfirmadoMes.pagoEm ? formatDate(pagamentoConfirmadoMes.pagoEm.split("T")[0]) : formatMesReferencia(mesAtivo)}.
        </AlertBanner>
      )}

      {cooperadoVistaMesHistorico && pagamentoRegistradoMes && cooperadoSelecionadoId && (
        <CooperadoHistoricoPagamentoMes
          pagamento={pagamentoRegistradoMes}
          mesReferencia={mesAtivoExibicao}
          descontoPadraoPct={data.config.descontoPadraoCooperativa}
          cnpj={coopCnpjResumo}
          cooperadoId={cooperadoSelecionadoId}
          cooperadoNome={nomeCooperado}
          onBaixarRecibo={
            pagamentoRegistradoMes.status === "confirmado" && pagamentoRegistradoMes.reciboHtml
              ? baixarReciboMesHistorico
              : undefined
          }
          aguardandoAssinatura={
            isCooperado &&
            fluxoReciboAssinatura &&
            pagamentoRegistradoMes.status === "aguardando_confirmacao"
          }
          onAssinarRecibo={
            isCooperado && fluxoReciboAssinatura ? () => setAssinaturaModal(true) : undefined
          }
          detalheEntregas={
            resumoItensMes.entregas > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setHistoricoEntregasExpandido((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  aria-expanded={historicoEntregasExpandido}
                >
                  <div>
                    <p className="font-semibold text-gray-900">Detalhe das entregas</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {resumoItensMes.entregas} entrega{resumoItensMes.entregas !== 1 ? "s" : ""} ·{" "}
                      {historicoEntregasExpandido ? "ocultar" : "ver lista"}
                    </p>
                  </div>
                  <ChevronDown
                    size={20}
                    className={cn(
                      "text-gray-400 shrink-0 transition-transform",
                      historicoEntregasExpandido && "rotate-180"
                    )}
                  />
                </button>
                {historicoEntregasExpandido && (
                  <div className="border-t border-gray-200 px-5 pb-5 pt-3">
                    <TabelaResumoItens itens={resumoItensMes.itens} entregas={resumoItensMes.entregas} />
                  </div>
                )}
              </div>
            ) : undefined
          }
        />
      )}

      {exibirRelatorioMes && !cooperadoVistaMesHistorico && (
        <>
          <Card
            title={
              isCooperado
                ? visualizandoHistorico
                  ? `Resumo · ${formatMesReferencia(mesAtivo)}`
                  : `Resumo · ${valorReceberConsolidado?.mesLabel ?? formatMesReferencia(mesAtivo)}`
                : `Ficha — ${nomeCooperado}`
            }
            className="mb-6"
          >
            {isCooperado ? (
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {statusCota === "paga" ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
                    <CheckCircle2 size={14} /> Cota paga
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                    Cota não paga
                  </span>
                )}
              </div>
            ) : (
              blocoCotaIngressoResponsavel
            )}

            {isCooperado && resumoExibicao && visualizandoHistorico && (
              <ResumoDescontosMes
                valorBruto={resumoExibicao.valorBruto}
                descontoCooperativa={resumoExibicao.descontoCooperativa}
                descontoPadraoPct={data.config.descontoPadraoCooperativa}
                valorEntregas={resumoExibicao.valorEntregas}
                descontosExtras={descontosExtrasCooperado}
                totalLiquido={
                  visualizandoHistorico
                    ? exibicaoOpts
                      ? bicCentralGetValorExibicaoCooperado(resumoExibicao, exibicaoOpts)
                      : resumoExibicao.valorEntregas
                    : mesesPendentesQuantoVouReceber.length > 1
                      ? resumoExibicao.valorLiquido
                      : (valorReceberConsolidado?.valor ?? 0)
                }
                rotuloTotal={
                  visualizandoHistorico
                    ? "Total recebido"
                    : "A receber"
                }
              />
            )}
            {visualizandoHistorico &&
              resumoExibicao &&
              cooperadoSelecionadoId &&
              coopCnpjResumo && (
                <HistoricoHbCreditosResumo
                  cnpj={coopCnpjResumo}
                  cooperadoId={cooperadoSelecionadoId}
                  mesReferencia={mesAtivo}
                  valorEntregas={resumoExibicao.valorEntregas}
                  descontosExtras={descontosExtrasCooperado}
                />
              )}

            {!isCooperado && check("ficha_corrida", "edit") && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 mb-4">
                Mensalidade e desconto avulso valem para <strong>todos os cooperados</strong> em{" "}
                {formatMesReferencia(mesAtivo)}.
              </div>
            )}

            {!isCooperado && check("ficha_corrida", "edit") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <FormField label="Mensalidade fixa (todos os cooperados)" hint="Descontada no pagamento de cada cooperado neste mês">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={mensalidadeInput}
                    onChange={(e) => setMensalidadeInput(e.target.value)}
                    onBlur={salvarAjustesFicha}
                  />
                </FormField>
                <FormField label="Desconto avulso (todos os cooperados)">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={descontoAvulsoInput}
                    onChange={(e) => setDescontoAvulsoInput(e.target.value)}
                    onBlur={salvarAjustesFicha}
                  />
                </FormField>
                <div className="sm:col-span-2">
                <FormField label="Motivo do desconto avulso">
                  <Textarea
                    value={descontoAvulsoMotivo}
                    onChange={(e) => setDescontoAvulsoMotivo(e.target.value)}
                    onBlur={salvarAjustesFicha}
                    placeholder="Ex.: ajuste de entrega anterior"
                    rows={2}
                  />
                </FormField>
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" variant="secondary" onClick={salvarAjustesFicha}>
                    Salvar mensalidade e desconto avulso
                  </Button>
                </div>
              </div>
            )}

            {!isCooperado && resumoExibicao && (
              <ResumoDescontosMes
                valorBruto={resumoExibicao.valorBruto}
                descontoCooperativa={resumoExibicao.descontoCooperativa}
                descontoPadraoPct={data.config.descontoPadraoCooperativa}
                valorEntregas={resumoExibicao.valorEntregas}
                descontosExtras={resumoExibicao.descontosExtras}
                totalLiquido={totalExibido}
                rotuloTotal="Total a pagar"
              />
            )}

            {descontosRegistradosMes.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm space-y-2 mb-4">
                <p className="font-semibold text-amber-900">Descontos registrados no mês</p>
                <ul className="divide-y divide-amber-100">
                  {descontosRegistradosMes.map((d) => (
                    <li key={d.id} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div>
                        <p className="font-medium text-gray-900">{TIPO_DESCONTO_LABELS[d.tipo] ?? d.tipo}</p>
                        <p className="text-xs text-gray-600">{d.motivo}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">Bruto {formatCurrency(d.valorBruto)}</p>
                        <p className="font-semibold text-red-700">- {formatCurrency(d.valorDescontado)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card
            title={`Resumo das entregas · ${
              isCooperado && !visualizandoHistorico && mesesPendentesQuantoVouReceber.length > 1
                ? formatMesesReferenciaRotulo(mesesPendentesQuantoVouReceber)
                : !isCooperado && mesesPendentesPagamento.length > 1
                  ? formatMesesReferenciaRotulo(mesesPendentesPagamento)
                  : formatMesReferencia(mesAtivo)
            }`}
            className="mb-6"
          >
            <TabelaResumoItens itens={resumoItensExibicao.itens} entregas={resumoItensExibicao.entregas} />
            {fichasPendentesMes.some((f) => f.divisaoEntrega && f.divisaoEntrega.participantes.length > 1) && (
              <div className="mt-4 space-y-2">
                {fichasPendentesMes
                  .filter((f) => f.divisaoEntrega && f.divisaoEntrega.participantes.length > 1)
                  .map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900"
                    >
                      <p className="font-medium">{textoInformativoDivisaoEntrega(f.divisaoEntrega!)}</p>
                      <p className="text-xs text-blue-800 mt-1">{f.descricao}</p>
                      <p className="text-xs text-blue-700 mt-1">{nomesParticipantesDivisao(f.divisaoEntrega!)}</p>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </>
      )}

      {cooperadoSelecionadoId && exibirPagamento && (
        <>
          {isCooperado && resumoQuantoVouReceber ? (
            <>
              <CooperadoQuantoVouReceberPainel
                estado={resumoQuantoVouReceber.estado}
                mesLabel={resumoQuantoVouReceber.mesLabel}
                valorDestaque={
                  resumoQuantoVouReceber.estado === "carregando"
                    ? 0
                    : !fluxoReciboAssinatura || resumoQuantoVouReceber.estado !== "aguardando_assinatura"
                      ? totalExibido
                      : resumoQuantoVouReceber.valorDestaque
                }
                tituloValor={resumoQuantoVouReceber.tituloValor}
                subtitulo={resumoQuantoVouReceber.subtitulo}
                acaoRotulo={fluxoReciboAssinatura ? resumoQuantoVouReceber.acaoRotulo : null}
                onAcao={
                  fluxoReciboAssinatura && resumoQuantoVouReceber.acaoRotulo
                    ? () => setAssinaturaModal(true)
                    : undefined
                }
                mostrarDetalheCalculo={Boolean(
                  resumoExibicao &&
                    (resumoExibicao.valorBruto > 0 ||
                      totalPendente > 0 ||
                      descontosExtrasCooperado.length > 0)
                )}
                detalheCalculo={
                  resumoExibicao
                    ? {
                        valorBruto: resumoExibicao.valorBruto,
                        descontoCooperativa: resumoExibicao.descontoCooperativa,
                        descontoPadraoPct: data.config.descontoPadraoCooperativa,
                        valorEntregas: resumoExibicao.valorEntregas,
                        descontosExtras: descontosExtrasCooperado,
                        totalLiquido: totalExibido,
                      }
                    : undefined
                }
              />
              {resumoExibicao &&
                cooperadoSelecionadoId &&
                coopCnpjResumo &&
                !mesQuitadoCooperado &&
                totalExibido > 0 &&
                descontosExtrasCooperado.some((d) => d.tipo === "conta_coop") && (
                  <div className="-mt-2 mb-4 px-1">
                    <HistoricoHbCreditosResumo
                      cnpj={coopCnpjResumo}
                      cooperadoId={cooperadoSelecionadoId}
                      mesReferencia={mesAtivo}
                      valorEntregas={resumoExibicao.valorEntregas}
                      descontosExtras={descontosExtrasCooperado}
                      variant="cooperado"
                    />
                  </div>
                )}
            </>
          ) : (
            <div className="bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 mb-6 shadow-sm">
              <p className="text-green-100 text-sm">
                Valor a pagar ·{" "}
                {pagamentoAguardandoExibicao ?? pagamentoAguardando
                  ? formatMesesReferenciaRotulo(
                      getMesesReferenciaPagamento((pagamentoAguardandoExibicao ?? pagamentoAguardando)!)
                    )
                  : mesesPendentesPagamento.length
                    ? formatMesesReferenciaRotulo(mesesPendentesPagamento)
                    : formatMesReferencia(mesAtivo)}
              </p>
              <p className="text-3xl sm:text-4xl font-bold mt-2">{formatCurrency(totalExibido)}</p>
              {nomeCooperado && <p className="text-green-100 text-sm mt-2">{nomeCooperado}</p>}
              {resumoExibicao &&
                (resumoExibicao.valorBruto > 0 || totalPendente > 0 || descontosExtrasCooperado.length > 0) && (
                  <ResumoDescontosMes
                    valorBruto={resumoExibicao.valorBruto}
                    descontoCooperativa={resumoExibicao.descontoCooperativa}
                    descontoPadraoPct={data.config.descontoPadraoCooperativa}
                    valorEntregas={resumoExibicao.valorEntregas}
                    descontosExtras={resumoExibicao.descontosExtras}
                    totalLiquido={totalExibido}
                    rotuloTotal="Total líquido a pagar"
                    tema="escuro"
                  />
                )}
            </div>
          )}

          {!isCooperado &&
            aba === "pagar" &&
            (resumoItensPagamento.entregas > 0 || fichasPendentesMes.length > 0) && (
              <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setLancamentosPagarExpandido((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  aria-expanded={lancamentosPagarExpandido}
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      Lançamentos ·{" "}
                      {mesesPendentesPagamento.length
                        ? formatMesesReferenciaRotulo(mesesPendentesPagamento)
                        : formatMesReferencia(mesAtivo)}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {fichasPendentesMes.length} entrega{fichasPendentesMes.length !== 1 ? "s" : ""}
                      {resumoItensPagamento.itens.length > 0 &&
                        ` · ${resumoItensPagamento.itens.length} item${resumoItensPagamento.itens.length !== 1 ? "s" : ""}`}
                      {" · "}
                      {lancamentosPagarExpandido ? "toque para ocultar" : "toque para ver detalhes"}
                    </p>
                  </div>
                  <ChevronDown
                    size={20}
                    className={cn(
                      "text-gray-400 shrink-0 transition-transform",
                      lancamentosPagarExpandido && "rotate-180"
                    )}
                  />
                </button>
                {lancamentosPagarExpandido && (
                  <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-5">
                    {resumoItensPagamento.entregas > 0 && (
                      <TabelaResumoItens
                        itens={resumoItensPagamento.itens}
                        entregas={resumoItensPagamento.entregas}
                      />
                    )}
                    {fichasPendentesMes.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-800 mb-3">Entregas pendentes de pagamento</p>
                        <div className="space-y-3">
                          {fichasPendentesMes.map((f) => {
                            const divisao = f.divisaoEntrega;
                            const dividida = divisao && divisao.participantes.length > 1;
                            return (
                              <div
                                key={f.id}
                                className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{f.descricao}</p>
                                  <p className="text-sm text-green-700 font-semibold mt-0.5">
                                    {formatCurrency(f.valorLiquido)}
                                    {dividida && (
                                      <span className="text-gray-500 font-normal ml-1">
                                        (parte de {divisao!.participantes.length})
                                      </span>
                                    )}
                                  </p>
                                  {dividida && (
                                    <p className="text-xs text-blue-800 mt-2 rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5">
                                      {textoInformativoDivisaoEntrega(divisao!)}
                                    </p>
                                  )}
                                </div>
                                {isDivisaoEntregaHabilitada() ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="shrink-0"
                                  onClick={() => abrirDivisaoEntrega(f)}
                                >
                                  <Users size={16} />
                                  {dividida ? "Alterar divisão" : "Dividir valor"}
                                </Button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          {!isCooperado && cooperadoSelecionado && check("ficha_corrida", "edit") && (
            <Card title={`Pagamento — ${nomeCooperado.split(" ")[0]}`} className="mb-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Wallet size={18} className="text-gray-500" />
                  <span>Chave PIX:</span>
                  {cooperadoSelecionado.chavePix ? (
                    <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">{cooperadoSelecionado.chavePix}</code>
                  ) : (
                    <span className="text-red-600 font-medium">Não cadastrada</span>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setChavePixEdit(cooperadoSelecionado.chavePix ?? "");
                      setPixEditarOpen(true);
                    }}
                  >
                    <Pencil size={14} /> Editar PIX
                  </Button>
                </div>
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => {
                      salvarAjustesFicha();
                      setPixStepVisited(true);
                      setPixModalOpen(true);
                    }}
                    disabled={!pixOk || totalPendente <= 0}
                    size="lg"
                    className="w-full"
                  >
                    <QrCode size={20} /> Gerar QR Code PIX
                  </Button>
                  <Button
                    size="lg"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      setPixStepVisited(true);
                      setConfirmPagamento(true);
                    }}
                    disabled={totalPendente <= 0}
                  >
                    <CheckCircle2 size={20} /> Pagamento realizado
                  </Button>
                  <Button variant="secondary" onClick={() => { setMotivoPix("Chave PIX não encontrada ou incorreta."); setPixInvalidoOpen(true); }}>
                    <XCircle size={18} /> Chave PIX com problema
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {!cooperadoSelecionadoId && !isCooperado && (
        <AlertBanner variant="info" className="mb-6">
          {aba === "pagar"
            ? "Escolha um cooperado com valor pendente de pagamento neste mês."
            : "Escolha um cooperado que já tenha entregas lançadas neste mês para ver a ficha corrida ou pagar."}
        </AlertBanner>
      )}

      {reciboAtual && (
        <Card title="Recibo assinado" className="mb-6">
          <p className="text-sm text-gray-600 mb-3">
            Recebimento confirmado · {formatMesReferencia(mesAtivo)}
            {reciboAtual.assinadoEm ? ` · ${formatDate(reciboAtual.assinadoEm.split("T")[0])}` : ""}
          </p>
          {reciboAtual.assinaturaCooperado && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reciboAtual.assinaturaCooperado}
              alt="Assinatura do cooperado"
              className="h-16 object-contain border-b-2 border-gray-800 mb-4 max-w-xs"
            />
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={baixarReciboAtual} size="lg" className="w-full sm:w-auto">
              <FileDown size={18} /> Baixar recibo assinado
            </Button>
            {!isCooperado && (
              <p className="text-xs text-gray-500 self-center">Arquivado na ficha do cooperado.</p>
            )}
          </div>
        </Card>
      )}

      {cooperadoSelecionado && pixOk && (
        <PixQrModal open={pixModalOpen} onClose={() => setPixModalOpen(false)} chavePix={cooperadoSelecionado.chavePix} nome={nomeCooperado} valor={totalPendente} />
      )}

      <DivisaoEntregaModal
        open={isDivisaoEntregaHabilitada() && Boolean(divisaoFicha)}
        onClose={() => {
          if (divisaoSalvando) return;
          setDivisaoFicha(null);
          setDivisaoSelecionados([]);
        }}
        ficha={divisaoFicha}
        cooperadoOrigemNome={
          divisaoFicha?.divisaoEntrega?.cooperadoOrigemNome ??
          notaDivisaoAtual?.cooperadoNomeSnapshot ??
          nomeCooperado
        }
        valorLiquidoTotal={notaDivisaoAtual?.valorLiquido ?? divisaoFicha?.valorLiquido}
        cooperadosDisponiveis={cooperadosParaDivisao}
        selecionados={divisaoSelecionados}
        onToggle={toggleCooperadoDivisao}
        onConfirm={() => void handleConfirmarDivisao()}
        salvando={divisaoSalvando}
        divisaoAtual={divisaoFicha?.divisaoEntrega ?? notaDivisaoAtual?.divisaoEntrega}
      />

      <ConfirmDialog
        open={confirmPagamento}
        onClose={() => setConfirmPagamento(false)}
        onConfirm={handleConfirmarPagamento}
        title="Confirmar pagamento"
        message={`Registrar pagamento de ${formatCurrency(totalPendente)} para ${nomeCooperado}? O cooperado receberá aviso para assinar o recibo.`}
        confirmLabel="Sim, pagamento realizado"
      />

      <PromptDialog
        open={pixInvalidoOpen}
        onClose={() => setPixInvalidoOpen(false)}
        title="Chave PIX com problema"
        label="O que o cooperado precisa corrigir?"
        confirmLabel="Avisar cooperado"
        suggestions={["Chave PIX não encontrada", "Chave pertence a outra pessoa", "CPF incorreto na chave"]}
        value={motivoPix}
        onChange={setMotivoPix}
        onConfirm={handlePixInvalido}
      />

      <PromptDialog
        open={pixEditarOpen}
        onClose={() => setPixEditarOpen(false)}
        title="Editar chave PIX"
        label="Informe a chave PIX correta do cooperado"
        confirmLabel="Salvar PIX"
        value={chavePixEdit}
        onChange={setChavePixEdit}
        onConfirm={handleSalvarPixCooperado}
      />

      <Modal
        open={assinaturaModal}
        onClose={() => setAssinaturaModal(false)}
        title="Confirmar recebimento"
        size="md"
        footer={
          <Button size="lg" className="w-full" disabled={!assinatura} onClick={handleEnviarAssinatura}>
            <PenLine size={18} /> Confirmar assinatura e enviar recibo
          </Button>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Confira se os valores abaixo estão corretos. Em seguida, assine para confirmar que recebeu o pagamento.
          </p>
          {resumoReciboPagamento && (pagamentoAguardandoExibicao ?? pagamentoAguardando) && (
            <ReciboResumoView
              resumo={resumoReciboPagamento}
              mesReferencia={(pagamentoAguardandoExibicao ?? pagamentoAguardando)!.mesReferencia}
              descontoPadraoPct={data.config.descontoPadraoCooperativa}
              compact
            />
          )}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-center text-green-900 font-semibold mb-3">Assinatura do cooperado</p>
            {isCooperado && cooperadoSelecionado ? (
              <AssinarComCadastroBlock
                cooperadoId={cooperadoSelecionado.id}
                cooperado={cooperadoSelecionado}
                assinatura={assinatura}
                onAssinaturaChange={setAssinatura}
                contexto="este recibo de pagamento"
              />
            ) : (
              <SignaturePad onChange={setAssinatura} />
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={reciboSucessoOpen}
        onClose={() => setReciboSucessoOpen(false)}
        title="Recebimento confirmado!"
        size="sm"
        footer={
          <div className="flex flex-col gap-2 w-full">
            <Button size="lg" className="w-full" onClick={() => { baixarReciboAtual(); setReciboSucessoOpen(false); }}>
              <FileDown size={18} /> Baixar recibo assinado
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setReciboSucessoOpen(false)}>
              Fechar
            </Button>
          </div>
        }
      >
        <div className="text-center py-2">
          <CheckCircle2 size={48} className="mx-auto text-green-600 mb-3" />
          <p className="text-gray-700">
            Sua assinatura foi registrada. O recibo foi enviado para a ficha na cooperativa e você pode baixá-lo agora.
          </p>
        </div>
      </Modal>
    </div>
  );
}
