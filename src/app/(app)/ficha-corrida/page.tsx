"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { QrCode, XCircle, Wallet, CheckCircle2, FileDown, PenLine, BookOpen, CreditCard, History, Users, ChevronDown } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  resumoFromPagamento,
  registrarPagamentoCooperado,
  confirmarPagamentoCooperado,
  getPagamentoAguardandoCooperado,
  getMensalidadeFixaMes,
  getStatusCotaCooperado,
  getArquivoMensalCooperado,
  upsertArquivoMensal,
  getAjustesCompartilhadosFichaMes,
  aplicarAjustesFichaMesTodosCooperados,
  upsertAjustesFichaMesCooperativa,
  agregarItensFichaMes,
} from "@/services/notaPedidoService";
import { listCooperadosComFichaNoMes, getCooperadoNomeResolvido, resolverCooperadoParaPagamento, fichaPertenceCooperado, listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj, patchNotaPedidoInCloud } from "@/services/notaPedidoCloudService";
import {
  pushOperacionalToCloud,
  pushNotasPagasToCloud,
} from "@/services/cooperativaSyncCloudService";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import {
  cooperadoMesQuitado,
  cooperadoTemValorPendente,
  cooperadoPendentePagamentoResponsavel,
  getMesQuantoVouReceber,
  getPagamentoConfirmadoMes,
  listarMesesPagosCooperado,
} from "@/services/cooperadoEntregasService";
import { PageHeader, FilterBar, Modal } from "@/components/ui/Table";
import { Select, FormField, Input, Textarea } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PixQrModal } from "@/components/pix/PixQrModal";
import { ConfirmDialog, PromptDialog } from "@/components/ui/ConfirmDialog";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { ReciboResumoView } from "@/components/ficha/ReciboResumoView";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import { DivisaoEntregaModal } from "@/components/ficha/DivisaoEntregaModal";
import { ValoresAvulsosReceberPanel } from "@/components/ficha/ValoresAvulsosReceberPanel";
import {
  dividirEntregaEntreCooperados,
  nomesParticipantesDivisao,
  textoInformativoDivisaoEntrega,
} from "@/services/divisaoEntregaService";
import { descontosDoCooperadoNoMes, TIPO_DESCONTO_LABELS } from "@/services/descontosService";
import {
  criarValorAvulsoReceber,
  cancelarValorAvulsoReceber,
} from "@/services/valoresAvulsosReceberService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { baixarRecibo, resumoReciboFromPagamento, nomeArquivoRecibo } from "@/utils/recibo";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia, cn } from "@/utils/format";
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
              <tr key={i.produtoInstituicaoId} className="hover:bg-green-50/40">
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
  const { user, isCooperado, cooperadoId, check } = usePermissions();
  const searchParams = useSearchParams();
  const [mesFilter, setMesFilter] = useState(searchParams.get("mes") ?? getCurrentMesReferencia());
  const [cooperadoFilter, setCooperadoFilter] = useState(searchParams.get("cooperado") ?? "");
  const [aba, setAba] = useState<"ficha" | "pagar">("ficha");
  const [abaMesCooperado, setAbaMesCooperado] = useState<"aberto" | string>("aberto");

  useEffect(() => {
    const c = searchParams.get("cooperado");
    const m = searchParams.get("mes");
    if (c && !isCooperado) setCooperadoFilter(c);
    if (m) setMesFilter(m);
  }, [searchParams, isCooperado]);

  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [confirmPagamento, setConfirmPagamento] = useState(false);
  const [pixInvalidoOpen, setPixInvalidoOpen] = useState(false);
  const [motivoPix, setMotivoPix] = useState("");
  const [pagoMsg, setPagoMsg] = useState("");
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

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const mesEmAberto = useMemo(() => {
    if (!data || !cooperadoId) return getCurrentMesReferencia();
    return getMesQuantoVouReceber(data, cooperadoId, coopId);
  }, [data, cooperadoId, coopId]);

  const mesesPagosCooperado = useMemo(() => {
    if (!data || !cooperadoId) return [];
    return listarMesesPagosCooperado(data, cooperadoId, coopId);
  }, [data, cooperadoId, coopId]);

  const visualizandoHistorico = isCooperado && abaMesCooperado !== "aberto";

  const mesAtivo = isCooperado
    ? visualizandoHistorico
      ? abaMesCooperado
      : mesEmAberto
    : mesFilter;

  useEffect(() => {
    if (!isCooperado) return;
    if (searchParams.get("mes")) {
      const m = searchParams.get("mes")!;
      if (mesesPagosCooperado.includes(m)) {
        setAbaMesCooperado(m);
      }
    }
  }, [isCooperado, searchParams, mesesPagosCooperado]);

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
    return cooperadosComFicha.filter((c) =>
      cooperadoPendentePagamentoResponsavel(data, c.id, mesAtivo, coopId)
    );
  }, [data, coopId, mesAtivo, cooperadosComFicha]);

  const cooperadosNoSelect = !isCooperado && aba === "pagar" ? cooperadosParaPagar : cooperadosComFicha;

  useEffect(() => {
    if (isCooperado || aba !== "pagar" || !cooperadoFilter || !data || !coopId) return;
    if (!cooperadoPendentePagamentoResponsavel(data, cooperadoFilter, mesAtivo, coopId)) {
      setCooperadoFilter("");
    }
  }, [isCooperado, aba, cooperadoFilter, data, coopId, mesAtivo]);

  const cooperadoSelecionadoId = isCooperado ? cooperadoId : cooperadoFilter;

  useEffect(() => {
    setLancamentosPagarExpandido(false);
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
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
  }, [user, data, coopId, isCooperado, mensalidadeInput, descontoAvulsoInput, descontoAvulsoMotivo, mesAtivo]);

  const pushOperacional = useCallback(() => {
    void (async () => {
      if (!user || !coopId) return;
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
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

  const toggleCotaPaga = () => {
    if (!user || !cooperadoSelecionadoId || !coopId || isCooperado) return;
    const novo = !arquivoMes?.cotaIngressoPaga;
    updateData((d) => ({
      ...d,
      arquivosMensais: upsertArquivoMensal(d, cooperadoSelecionadoId, coopId, mesAtivo, {
        cotaIngressoPaga: novo,
      }),
    }));
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
  };

  const resumoItensMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return { itens: [], entregas: 0, valorBruto: 0 };
    return agregarItensFichaMes(data, cooperadoSelecionadoId, mesAtivo, coopId);
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

  const fichasPendentesMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return [];
    return data.fichaCorrida.filter(
      (f) =>
        fichaPertenceCooperado(data, f, cooperadoSelecionadoId, coopId) &&
        f.mesReferencia === mesAtivo &&
        f.status === "pendente"
    );
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

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
    return getPagamentoAguardandoCooperado(data, cooperadoSelecionadoId, mesAtivo);
  }, [data, cooperadoSelecionadoId, mesAtivo]);

  const pagamentoConfirmadoMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return getPagamentoConfirmadoMes(data, cooperadoSelecionadoId, mesAtivo);
  }, [data, cooperadoSelecionadoId, mesAtivo]);

  const resumo = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return null;
    if (pagamentoAguardando) return resumoFromPagamento(pagamentoAguardando);
    if (visualizandoHistorico && pagamentoConfirmadoMes) {
      return resumoFromPagamento(pagamentoConfirmadoMes);
    }
    return getResumoPagamentoExibicao(
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
    visualizandoHistorico,
    pagamentoConfirmadoMes,
  ]);

  const totalPendente = resumo?.valorLiquido ?? 0;
  const totalExibido =
    visualizandoHistorico && pagamentoConfirmadoMes
      ? pagamentoConfirmadoMes.valorLiquido
      : totalPendente;

  const pendentePagamentoResponsavel = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return false;
    return cooperadoPendentePagamentoResponsavel(data, cooperadoSelecionadoId, mesAtivo, coopId);
  }, [data, cooperadoSelecionadoId, mesAtivo, coopId]);

  const descontosRegistradosMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return [];
    return descontosDoCooperadoNoMes(data, cooperadoSelecionadoId, mesAtivo);
  }, [data, cooperadoSelecionadoId, mesAtivo]);

  const resumoReciboPagamento = useMemo(() => {
    if (!pagamentoAguardando) return null;
    return resumoReciboFromPagamento(pagamentoAguardando, resumoItensMes);
  }, [pagamentoAguardando, resumoItensMes]);

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

  const abrirDivisaoEntrega = (ficha: FichaCorrida) => {
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
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
      setDivisaoFicha(null);
      setDivisaoSelecionados([]);
    } finally {
      setDivisaoSalvando(false);
    }
  };

  const handleConfirmarPagamento = () => {
    if (!cooperadoSelecionado || !user || !data || !coopId || totalPendente <= 0) return;
    const mensalidadeFixa = parseFloat(mensalidadeInput.replace(",", ".")) || 0;
    const descontoAvulso = parseFloat(descontoAvulsoInput.replace(",", ".")) || 0;
    const patch = {
      mensalidadeFixa,
      descontoAvulso,
      descontoAvulsoMotivo: descontoAvulsoMotivo.trim() || undefined,
    };
    const resumoPag = getResumoPagamentoCooperado(data, cooperadoSelecionado.id, mesAtivo, coopId, patch);
    updateData((d) => {
      const ajustesFichaMes = upsertAjustesFichaMesCooperativa(d, coopId, mesAtivo, patch);
      const comAjustes = addAuditEntry(
        {
          ...d,
          ajustesFichaMes,
          arquivosMensais: aplicarAjustesFichaMesTodosCooperados({ ...d, ajustesFichaMes }, coopId, mesAtivo, patch),
        },
        {
          entityType: "ficha_corrida",
          entityId: cooperadoSelecionado.id,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: `Mensalidade e desconto avulso aplicados a todos os cooperados · ${formatMesReferencia(mesAtivo)}`,
        }
      );
      return addAuditEntry(registrarPagamentoCooperado(comAjustes, cooperadoSelecionado.id, mesAtivo, user.name), {
        entityType: "ficha_corrida", entityId: cooperadoSelecionado.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: `Pagamento: ${formatCurrency(totalPendente)}`,
      });
    });
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (!cnpj) return;
      await pushOperacionalToCloud(cnpj, d, coopId);
      await pushNotasPagasToCloud(cnpj, resumoPag.notaPedidoIds, d);
    })();
    setConfirmPagamento(false);
    setCooperadoFilter("");
    setAba("ficha");
    setPagoMsg(`Pagamento registrado! ${nomeCooperado.split(" ")[0]} foi notificado(a). Consulte a ficha corrida para acompanhar a assinatura.`);
  };

  const handleEnviarAssinatura = () => {
    if (!pagamentoAguardando || !assinatura || !user) return;
    updateData((d) => {
      const next = confirmarPagamentoCooperado(d, pagamentoAguardando.id, assinatura);
      const pg = next.pagamentosCooperado.find((p) => p.id === pagamentoAguardando.id);
      if (pg) setPagamentoConfirmado(pg);
      return addAuditEntry(next, {
        entityType: "pagamento", entityId: pagamentoAguardando.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: "Cooperado confirmou pagamento com assinatura",
      });
    });
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
    setAssinaturaModal(false);
    setAssinatura(null);
    setReciboSucessoOpen(true);
  };

  const reciboAtual = pagamentoConfirmado ?? pagamentoConfirmadoMes;

  const mesQuitadoCooperado =
    isCooperado && cooperadoId && data ? cooperadoMesQuitado(data, cooperadoId, mesAtivo) : false;
  const exibirQuantoVouReceber =
    !isCooperado ||
    (!!data &&
      !!cooperadoId &&
      (!!pagamentoAguardando || cooperadoTemValorPendente(data, cooperadoId, coopId)));

  const exibirRelatorioMes =
    !!cooperadoSelecionadoId &&
    (isCooperado || aba === "ficha") &&
    (visualizandoHistorico ? !!pagamentoConfirmadoMes : exibirQuantoVouReceber);

  const exibirPagamento =
    !!cooperadoSelecionadoId &&
    (isCooperado || aba === "pagar") &&
    (isCooperado
      ? visualizandoHistorico
        ? !!pagamentoConfirmadoMes
        : exibirQuantoVouReceber
      : pendentePagamentoResponsavel);

  const baixarReciboAtual = () => {
    const pg = reciboAtual;
    if (!pg?.reciboHtml) return;
    void baixarRecibo(pg.reciboHtml, nomeArquivoRecibo(pg.mesReferencia, nomeCooperado || "cooperado"));
  };

  if (!data) return null;

  const pixOk = cooperadoSelecionado && !cooperadoPrecisaCadastrarPix(cooperadoSelecionado.chavePix, cooperadoSelecionado.pixValido);
  const mostrarPagar = isCooperado || aba === "pagar";

  return (
    <div>
      <PageHeader
        title={isCooperado ? "Quanto vou receber" : "Ficha corrida dos cooperados"}
        subtitle={
          isCooperado
            ? "Mês em aberto com valores pendentes — meses pagos ficam nas abas ao lado"
            : "Total consolidado das entregas por cooperado; em Pagar fica só o valor e o PIX"
        }
      />

      {pagoMsg && <AlertBanner variant="success" className="mb-4" onDismiss={() => setPagoMsg("")}>{pagoMsg}</AlertBanner>}

      {isCooperado && !visualizandoHistorico && pagamentoAguardando && (
        <AlertBanner variant="success" title="Pagamento realizado pela cooperativa" className="mb-4">
          Valor: <strong>{formatCurrency(pagamentoAguardando.valorLiquido)}</strong>. Confira o recibo abaixo e confirme o recebimento assinando.
          <Button className="mt-3 w-full sm:w-auto" size="lg" onClick={() => setAssinaturaModal(true)}>
            <CheckCircle2 size={18} /> Confirmar recebimento
          </Button>
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
              {visualizandoHistorico ? formatMesReferencia(mesAtivo) : "Mês em aberto"}
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
          {mesesPagosCooperado.map((m) => (
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

      {isCooperado && !visualizandoHistorico && mesQuitadoCooperado && !pagamentoAguardando && (
        <div className="text-center py-14 px-6 bg-white rounded-2xl border border-emerald-200 mb-6">
          <CheckCircle2 size={52} className="mx-auto text-emerald-600 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Pagamento confirmado</h2>
          <p className="text-gray-600 mt-2 max-w-md mx-auto">
            O mês de {formatMesReferencia(mesAtivo)} já foi quitado. Consulte o histórico na aba{" "}
            <strong>{formatMesReferencia(mesAtivo)}</strong> ou veja entregas em{" "}
            <strong>Minhas entregas</strong>.
          </p>
          <Link href="/notas-pedido" className="inline-block mt-6">
            <Button size="lg">
              <History size={18} /> Ver minhas entregas
            </Button>
          </Link>
        </div>
      )}

      {isCooperado && !visualizandoHistorico && !exibirQuantoVouReceber && !mesQuitadoCooperado && (
        <div className="text-center py-14 px-6 bg-white rounded-2xl border border-dashed border-gray-300 mb-6">
          <Wallet size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-800">Nada a receber agora</h2>
          <p className="text-sm text-gray-500 mt-2">
            Quando a cooperativa aprovar suas entregas, os valores aparecem aqui automaticamente.
          </p>
          <Link href="/notas-pedido" className="inline-block mt-4">
            <Button variant="secondary">Ver minhas entregas</Button>
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
            <BookOpen size={16} /> Ficha corrida
          </button>
          <button
            type="button"
            onClick={() => setAba("pagar")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${aba === "pagar" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <CreditCard size={16} /> Pagar cooperado
            {cooperadosParaPagar.length > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {cooperadosParaPagar.length}
              </span>
            )}
          </button>
        </div>
      )}

      {cooperadoSelecionadoId && (
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

      {!isCooperado && aba === "pagar" && cooperadosParaPagar.length === 0 && (
        <AlertBanner variant="success" className="mb-6" title="Nenhum pagamento pendente">
          Todos os cooperados com valor neste mês já tiveram pagamento registrado. Acompanhe assinaturas e histórico na aba{" "}
          <strong>Ficha corrida</strong>.
        </AlertBanner>
      )}

      {!isCooperado && aba === "ficha" && cooperadoSelecionadoId && pagamentoAguardando && (
        <AlertBanner variant="info" className="mb-6" title="Pagamento registrado">
          {formatCurrency(pagamentoAguardando.valorLiquido)} · aguardando {nomeCooperado.split(" ")[0]} confirmar recebimento e assinar o recibo.
        </AlertBanner>
      )}

      {!isCooperado && aba === "ficha" && cooperadoSelecionadoId && pagamentoConfirmadoMes && !pagamentoAguardando && (
        <AlertBanner variant="success" className="mb-6" title="Pagamento confirmado">
          Recibo assinado por {nomeCooperado.split(" ")[0]} em{" "}
          {pagamentoConfirmadoMes.assinadoEm ? formatDate(pagamentoConfirmadoMes.assinadoEm.split("T")[0]) : formatMesReferencia(mesAtivo)}.
        </AlertBanner>
      )}

      {exibirRelatorioMes && (
        <>
          <Card title={isCooperado ? `Resumo · ${formatMesReferencia(mesAtivo)}` : `Ficha — ${nomeCooperado}`} className="mb-6">
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
              {!isCooperado && check("ficha_corrida", "edit") && statusCota !== "paga" && (
                <Button size="sm" variant="secondary" onClick={toggleCotaPaga}>
                  Confirmar cota paga
                </Button>
              )}
            </div>

            {isCooperado && (mensalidadePadrao > 0 || (arquivoMes?.descontoAvulso ?? ajustesCompartilhadosMes?.descontoAvulso ?? 0) > 0) && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm space-y-2 mb-4">
                <p className="font-semibold text-blue-900">Descontos aplicados pela cooperativa</p>
                {mensalidadePadrao > 0 && (
                  <div className="flex justify-between text-gray-800">
                    <span>Mensalidade</span>
                    <span className="font-medium text-red-700">- {formatCurrency(mensalidadePadrao)}</span>
                  </div>
                )}
                {(arquivoMes?.descontoAvulso ?? ajustesCompartilhadosMes?.descontoAvulso ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-800 gap-3">
                    <span>
                      {arquivoMes?.descontoAvulsoMotivo?.trim() ||
                        ajustesCompartilhadosMes?.descontoAvulsoMotivo?.trim() ||
                        "Desconto avulso"}
                    </span>
                    <span className="font-medium text-red-700 shrink-0">
                      -{" "}
                      {formatCurrency(
                        arquivoMes?.descontoAvulso ?? ajustesCompartilhadosMes?.descontoAvulso ?? 0
                      )}
                    </span>
                  </div>
                )}
              </div>
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

            {resumo && (
              <ResumoDescontosMes
                valorBruto={resumo.valorBruto}
                descontoCooperativa={resumo.descontoCooperativa}
                descontoPadraoPct={data.config.descontoPadraoCooperativa}
                valorEntregas={resumo.valorEntregas}
                descontosExtras={resumo.descontosExtras}
                totalLiquido={totalExibido}
                rotuloTotal={
                  isCooperado
                    ? visualizandoHistorico
                      ? "Total recebido"
                      : "A receber"
                    : "Total a pagar"
                }
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

          <Card title={`Resumo das entregas · ${formatMesReferencia(mesAtivo)}`} className="mb-6">
            <TabelaResumoItens itens={resumoItensMes.itens} entregas={resumoItensMes.entregas} />
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
          <div className="bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 mb-6 shadow-sm">
            <p className="text-green-100 text-sm">
              {isCooperado
                ? visualizandoHistorico
                  ? "Total recebido"
                  : "Total a receber"
                : "Valor a pagar"}{" "}
              · {formatMesReferencia(mesAtivo)}
            </p>
            <p className="text-3xl sm:text-4xl font-bold mt-2">
              {formatCurrency(totalExibido)}
            </p>
            {!isCooperado && nomeCooperado && (
              <p className="text-green-100 text-sm mt-2">{nomeCooperado}</p>
            )}
            {resumo && (resumo.valorBruto > 0 || totalPendente > 0 || resumo.descontosExtras.length > 0) && (
              <ResumoDescontosMes
                valorBruto={resumo.valorBruto}
                descontoCooperativa={resumo.descontoCooperativa}
                descontoPadraoPct={data.config.descontoPadraoCooperativa}
                valorEntregas={resumo.valorEntregas}
                descontosExtras={resumo.descontosExtras}
                totalLiquido={totalExibido}
                rotuloTotal={
                  isCooperado
                    ? visualizandoHistorico
                      ? "Total recebido"
                      : "Total a receber"
                    : "Total líquido a pagar"
                }
                tema="escuro"
              />
            )}
          </div>

          {!isCooperado &&
            aba === "pagar" &&
            (resumoItensMes.entregas > 0 || fichasPendentesMes.length > 0) && (
              <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setLancamentosPagarExpandido((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  aria-expanded={lancamentosPagarExpandido}
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      Lançamentos · {formatMesReferencia(mesAtivo)}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {fichasPendentesMes.length} entrega{fichasPendentesMes.length !== 1 ? "s" : ""}
                      {resumoItensMes.itens.length > 0 &&
                        ` · ${resumoItensMes.itens.length} item${resumoItensMes.itens.length !== 1 ? "s" : ""}`}
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
                    {resumoItensMes.entregas > 0 && (
                      <TabelaResumoItens itens={resumoItensMes.itens} entregas={resumoItensMes.entregas} />
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
                <div className="flex items-center gap-2 text-sm">
                  <Wallet size={18} className="text-gray-500" />
                  <span>Chave PIX:</span>
                  {cooperadoSelecionado.chavePix ? (
                    <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">{cooperadoSelecionado.chavePix}</code>
                  ) : (
                    <span className="text-red-600 font-medium">Não cadastrada</span>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <Button onClick={() => { salvarAjustesFicha(); setPixModalOpen(true); }} disabled={!pixOk || totalPendente <= 0} size="lg" className="w-full">
                    <QrCode size={20} /> Gerar QR Code PIX
                  </Button>
                  <Button
                    size="lg"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setConfirmPagamento(true)}
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
        open={Boolean(divisaoFicha)}
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
          {resumoReciboPagamento && pagamentoAguardando && (
            <ReciboResumoView
              resumo={resumoReciboPagamento}
              mesReferencia={pagamentoAguardando.mesReferencia}
              descontoPadraoPct={data.config.descontoPadraoCooperativa}
              compact
            />
          )}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-center text-green-900 font-semibold mb-3">Assinatura do cooperado</p>
            <SignaturePad onChange={setAssinatura} />
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
