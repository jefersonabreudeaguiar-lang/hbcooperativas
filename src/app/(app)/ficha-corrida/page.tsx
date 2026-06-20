"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { QrCode, XCircle, Wallet, CheckCircle2, FileDown, PenLine, BookOpen, CreditCard, History } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  getResumoPagamentoCooperado,
  registrarPagamentoCooperado,
  confirmarPagamentoCooperado,
  getPagamentoAguardandoCooperado,
  getMensalidadeFixaMes,
  getStatusCotaCooperado,
  getArquivoMensalCooperado,
  upsertArquivoMensal,
  agregarItensFichaMes,
} from "@/services/notaPedidoService";
import { listCooperadosComFichaNoMes, getCooperadoNomeResolvido, resolverCooperadoParaPagamento } from "@/services/cooperadoCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  syncAllCooperativaFromCloud,
  pushOperacionalToCloud,
  pushNotasPagasToCloud,
} from "@/services/cooperativaSyncCloudService";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import {
  cooperadoMesQuitado,
  cooperadoTemValorPendente,
  getMesQuantoVouReceber,
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
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { baixarReciboHtml, resumoReciboFromPagamento, nomeArquivoRecibo } from "@/utils/recibo";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { PagamentoCooperadoRegistro } from "@/types";

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

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  useEffect(() => {
    if (!isCooperado || !cooperadoId || !data) return;
    setMesFilter(getMesQuantoVouReceber(data, cooperadoId, coopId));
  }, [isCooperado, cooperadoId, data, coopId]);

  useEffect(() => {
    if (!data || !user) return;
    void (async () => {
      const cid = coopId ?? getUserCooperativaId(user, data);
      const cnpj = await resolveCooperativaCnpj(data, cid, user);
      if (cnpj) await syncAllCooperativaFromCloud(cnpj);
    })();
    const id = setInterval(() => {
      void (async () => {
        const d = getData();
        if (!d) return;
        const cid = coopId ?? getUserCooperativaId(user, d);
        const cnpj = await resolveCooperativaCnpj(d, cid, user);
        if (cnpj) await syncAllCooperativaFromCloud(cnpj);
      })();
    }, 12000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, coopId]);

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    const set = new Set(data.fichaCorrida.map((f) => f.mesReferencia));
    set.add(getCurrentMesReferencia());
    return [...set].sort().reverse();
  }, [data]);

  const cooperadosComFicha = useMemo(() => {
    if (!data || !coopId) return [];
    return listCooperadosComFichaNoMes(data, coopId, mesFilter);
  }, [data, coopId, mesFilter]);

  const cooperadoSelecionadoId = isCooperado ? cooperadoId : cooperadoFilter;

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
    return getArquivoMensalCooperado(data, cooperadoSelecionadoId, mesFilter);
  }, [data, cooperadoSelecionadoId, mesFilter]);

  const mensalidadePadrao = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return 0;
    return getMensalidadeFixaMes(data, cooperadoSelecionadoId, mesFilter, coopId);
  }, [data, cooperadoSelecionadoId, mesFilter, coopId]);

  const statusCota = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return "sem_cota" as const;
    return getStatusCotaCooperado(data, cooperadoSelecionadoId, mesFilter);
  }, [data, cooperadoSelecionadoId, mesFilter]);

  useEffect(() => {
    if (!cooperadoSelecionadoId) return;
    setMensalidadeInput(String(mensalidadePadrao || ""));
    setDescontoAvulsoInput(String(arquivoMes?.descontoAvulso ?? ""));
    setDescontoAvulsoMotivo(arquivoMes?.descontoAvulsoMotivo ?? "");
  }, [cooperadoSelecionadoId, mesFilter, mensalidadePadrao, arquivoMes]);

  const salvarAjustesFicha = useCallback(() => {
    if (!user || !data || !cooperadoSelecionadoId || !coopId || isCooperado) return;
    const mensalidadeFixa = parseFloat(mensalidadeInput.replace(",", ".")) || 0;
    const descontoAvulso = parseFloat(descontoAvulsoInput.replace(",", ".")) || 0;
    updateData((d) =>
      addAuditEntry(
        {
          ...d,
          arquivosMensais: upsertArquivoMensal(d, cooperadoSelecionadoId, coopId, mesFilter, {
            mensalidadeFixa,
            descontoAvulso,
            descontoAvulsoMotivo: descontoAvulsoMotivo.trim() || undefined,
          }),
        },
        {
          entityType: "ficha_corrida",
          entityId: cooperadoSelecionadoId,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: "Ajustes de mensalidade e desconto avulso na ficha",
        }
      )
    );
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
  }, [user, data, cooperadoSelecionadoId, coopId, isCooperado, mensalidadeInput, descontoAvulsoInput, descontoAvulsoMotivo, mesFilter]);

  const toggleCotaPaga = () => {
    if (!user || !cooperadoSelecionadoId || !coopId || isCooperado) return;
    const novo = !arquivoMes?.cotaIngressoPaga;
    updateData((d) => ({
      ...d,
      arquivosMensais: upsertArquivoMensal(d, cooperadoSelecionadoId, coopId, mesFilter, {
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
    return agregarItensFichaMes(data, cooperadoSelecionadoId, mesFilter, coopId);
  }, [data, cooperadoSelecionadoId, mesFilter, coopId]);

  const resumo = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return null;
    return getResumoPagamentoCooperado(data, cooperadoSelecionadoId, mesFilter);
  }, [data, cooperadoSelecionadoId, mesFilter, arquivoMes?.descontoAvulso, arquivoMes?.mensalidadeFixa]);

  const totalPendente = resumo?.valorLiquido ?? 0;
  const totalEntregas = resumo?.valorEntregas ?? 0;

  const pagamentoAguardando = useMemo(() => {
    if (!data || !cooperadoId) return undefined;
    return getPagamentoAguardandoCooperado(data, cooperadoId, mesFilter);
  }, [data, cooperadoId, mesFilter]);

  const pagamentoConfirmadoMes = useMemo(() => {
    if (!data || !cooperadoSelecionadoId) return undefined;
    return data.pagamentosCooperado.find(
      (p) => p.cooperadoId === cooperadoSelecionadoId && p.mesReferencia === mesFilter && p.status === "confirmado"
    );
  }, [data, cooperadoSelecionadoId, mesFilter]);

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

  const handleConfirmarPagamento = () => {
    if (!cooperadoSelecionado || !user || totalPendente <= 0) return;
    const resumo = getResumoPagamentoCooperado(data!, cooperadoSelecionado.id, mesFilter);
    salvarAjustesFicha();
    updateData((d) =>
      addAuditEntry(registrarPagamentoCooperado(d, cooperadoSelecionado.id, mesFilter, user.name), {
        entityType: "ficha_corrida", entityId: cooperadoSelecionado.id, action: "aprovar",
        userId: user.id, userName: user.name, changes: `Pagamento: ${formatCurrency(totalPendente)}`,
      })
    );
    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (!cnpj) return;
      await pushOperacionalToCloud(cnpj, d, coopId);
      await pushNotasPagasToCloud(cnpj, resumo.notaPedidoIds, d);
    })();
    setConfirmPagamento(false);
    setPagoMsg(`Pagamento registrado! ${nomeCooperado.split(" ")[0]} foi notificado(a).`);
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

  const reciboAtual =
    isCooperado && cooperadoId && data && cooperadoMesQuitado(data, cooperadoId, mesFilter)
      ? undefined
      : pagamentoConfirmado ?? pagamentoConfirmadoMes;

  const mesQuitadoCooperado =
    isCooperado && cooperadoId && data ? cooperadoMesQuitado(data, cooperadoId, mesFilter) : false;
  const exibirQuantoVouReceber =
    !isCooperado ||
    (!!data &&
      !!cooperadoId &&
      (!!pagamentoAguardando || cooperadoTemValorPendente(data, cooperadoId, coopId)));

  const baixarReciboAtual = () => {
    const pg = reciboAtual;
    if (!pg?.reciboHtml) return;
    baixarReciboHtml(pg.reciboHtml, nomeArquivoRecibo(pg.mesReferencia, nomeCooperado || "cooperado"));
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
            ? "Valores do mês em aberto — após o pagamento, consulte o histórico em Minhas entregas"
            : "Total consolidado das entregas por cooperado; em Pagar fica só o valor e o PIX"
        }
      />

      {pagoMsg && <AlertBanner variant="success" className="mb-4" onDismiss={() => setPagoMsg("")}>{pagoMsg}</AlertBanner>}

      {isCooperado && pagamentoAguardando && (
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
              <option value="">Escolha o cooperado...</option>
              {cooperadosComFicha.map((c) => (
                <option key={c.id} value={c.id}>{getCooperadoNomeResolvido(data, c.id, coopId)}</option>
              ))}
            </Select>
          </FormField>
        )}
        {isCooperado ? (
          <div className="flex items-center gap-2 py-1">
            <span className="text-sm text-gray-600">Mês em aberto:</span>
            <span className="text-sm font-bold text-green-800 bg-green-100 px-3 py-1.5 rounded-full">
              {formatMesReferencia(mesFilter)}
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

      {isCooperado && mesQuitadoCooperado && !pagamentoAguardando && (
        <div className="text-center py-14 px-6 bg-white rounded-2xl border border-emerald-200 mb-6">
          <CheckCircle2 size={52} className="mx-auto text-emerald-600 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Pagamento confirmado</h2>
          <p className="text-gray-600 mt-2 max-w-md mx-auto">
            O mês de {formatMesReferencia(mesFilter)} já foi quitado. Fotos, totais e recibo ficam em{" "}
            <strong>Minhas entregas</strong>, organizados por mês.
          </p>
          <Link href="/notas-pedido" className="inline-block mt-6">
            <Button size="lg">
              <History size={18} /> Ver minhas entregas
            </Button>
          </Link>
        </div>
      )}

      {isCooperado && !exibirQuantoVouReceber && !mesQuitadoCooperado && (
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
          </button>
        </div>
      )}

      {cooperadoSelecionadoId && (isCooperado || aba === "ficha") && exibirQuantoVouReceber && (
        <>
          <Card title={isCooperado ? `Resumo · ${formatMesReferencia(mesFilter)}` : `Ficha — ${nomeCooperado}`} className="mb-6">
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

            {!isCooperado && check("ficha_corrida", "edit") ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <FormField label="Mensalidade fixa (desconto de todos)" hint="Valor descontado no pagamento do mês">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={mensalidadeInput}
                    onChange={(e) => setMensalidadeInput(e.target.value)}
                    onBlur={salvarAjustesFicha}
                  />
                </FormField>
                <FormField label="Desconto avulso (R$)">
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
              </div>
            ) : (
              <div className="text-sm text-gray-600 space-y-1 mb-4">
                {mensalidadePadrao > 0 && (
                  <p>Mensalidade do mês: <strong>{formatCurrency(mensalidadePadrao)}</strong></p>
                )}
                {(arquivoMes?.descontoAvulso ?? 0) > 0 && (
                  <p>Desconto avulso: <strong>- {formatCurrency(arquivoMes!.descontoAvulso!)}</strong>
                    {arquivoMes?.descontoAvulsoMotivo ? ` (${arquivoMes.descontoAvulsoMotivo})` : ""}
                  </p>
                )}
              </div>
            )}

            {resumo && (
              <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1 border">
                <div className="flex justify-between"><span>Total entregas (bruto)</span><span>{formatCurrency(resumo.valorBruto)}</span></div>
                {resumo.descontoCooperativa > 0 && (
                  <div className="flex justify-between text-amber-700"><span>Desconto cooperativa</span><span>- {formatCurrency(resumo.descontoCooperativa)}</span></div>
                )}
                <div className="flex justify-between"><span>Entregas líquidas</span><span>{formatCurrency(totalEntregas)}</span></div>
                {resumo.descontosExtras.map((d, i) => (
                  <div key={i} className="flex justify-between text-red-600"><span>{d.motivo}</span><span>- {formatCurrency(d.valor)}</span></div>
                ))}
                <div className="flex justify-between font-bold text-green-700 text-base pt-2 border-t border-gray-200">
                  <span>A receber</span><span>{formatCurrency(totalPendente)}</span>
                </div>
              </div>
            )}
          </Card>

          <Card title={`Resumo das entregas · ${formatMesReferencia(mesFilter)}`} className="mb-6">
            <TabelaResumoItens itens={resumoItensMes.itens} entregas={resumoItensMes.entregas} />
          </Card>
        </>
      )}

      {cooperadoSelecionadoId && mostrarPagar && exibirQuantoVouReceber && (
        <>
          <div className="bg-gradient-to-br from-green-700 to-green-800 text-white rounded-2xl p-6 mb-6 shadow-sm">
            <p className="text-green-100 text-sm">{isCooperado ? "Total a receber" : "Valor a pagar"} · {formatMesReferencia(mesFilter)}</p>
            <p className="text-3xl sm:text-4xl font-bold mt-2">
              {formatCurrency(isCooperado && pagamentoAguardando ? pagamentoAguardando.valorLiquido : totalPendente)}
            </p>
            {!isCooperado && nomeCooperado && (
              <p className="text-green-100 text-sm mt-2">{nomeCooperado}</p>
            )}
            {resumo && totalEntregas > 0 && (
              <div className="mt-4 text-sm text-green-100 space-y-1 border-t border-green-600/40 pt-3">
                <div className="flex justify-between"><span>Entregas</span><span>{formatCurrency(totalEntregas)}</span></div>
                {resumo.descontosExtras.map((d, i) => (
                  <div key={i} className="flex justify-between"><span>{d.motivo}</span><span>- {formatCurrency(d.valor)}</span></div>
                ))}
                <div className="flex justify-between font-semibold text-white pt-1"><span>Total líquido</span><span>{formatCurrency(totalPendente)}</span></div>
              </div>
            )}
          </div>

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
          Escolha um cooperado que já tenha entregas lançadas neste mês para ver a ficha corrida ou pagar.
        </AlertBanner>
      )}

      {reciboAtual && (
        <Card title="Recibo assinado" className="mb-6">
          <p className="text-sm text-gray-600 mb-3">
            Recebimento confirmado · {formatMesReferencia(mesFilter)}
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
