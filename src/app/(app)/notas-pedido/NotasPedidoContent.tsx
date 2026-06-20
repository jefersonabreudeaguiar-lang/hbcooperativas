"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Camera, CheckCircle, FileText, XCircle, RefreshCw, ChevronRight, Eye, Building2, Pencil, UserPlus,
} from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField, Textarea } from "@/components/ui/Form";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PromptDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import {
  calcularItensNota,
  gerarNumeroNota,
  buildFichaFromNota,
  aplicarItensNaNota,
} from "@/services/notaPedidoService";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import { sortPorOrdemLancamento } from "@/utils/produtos";
import {
  getInstituicaoPadraoId,
  setInstituicaoPadraoId,
  resolverInstituicaoConferencia,
} from "@/utils/instituicaoPreferida";
import { getCooperadoNome } from "@/utils/calculations";
import type { NotaPedido, NotaPedidoItem, Cooperado } from "@/types";

const NOVO_AVULSO = "__novo__";

const REJEICAO_SUGESTOES = [
  "Foto escura ou ilegível",
  "Pedido sem assinatura",
  "Escola incorreta",
  "Foto cortada — mostre o pedido inteiro",
];

interface ItemForm {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
}

function getEscolaNotaLabel(
  nota: NotaPedido,
  instituicoes: { id: string; nome: string }[]
): string {
  if (nota.escolaAvulsaNome?.trim()) return nota.escolaAvulsaNome.trim();
  const inst = instituicoes.find((i) => i.id === nota.instituicaoId);
  if (inst) return inst.nome;
  return "Escola na nota";
}

function loadItensFromInstituicao(
  data: NonNullable<ReturnType<typeof useAppData>>,
  instituicaoId: string,
  existing?: NotaPedidoItem[]
): ItemForm[] {
  return sortPorOrdemLancamento(
    data.produtosInstituicao.filter((p) => p.instituicaoId === instituicaoId && p.ativo)
  ).map((p) => {
      const prev = existing?.find((i) => i.produtoInstituicaoId === p.id);
      return {
        produtoInstituicaoId: p.id,
        produtoNome: p.nome,
        unidade: p.unidade,
        precoUnitario: p.precoUnitario,
        quantidade: prev?.quantidade ?? 0,
      };
    });
}

export default function NotasPedidoContent() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const searchParams = useSearchParams();

  const [statusFilter, setStatusFilter] = useState("");
  const [anexarModal, setAnexarModal] = useState(false);
  const [conferirModal, setConferirModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [conferirStep, setConferirStep] = useState(1);
  const [lancadoMsg, setLancadoMsg] = useState("");

  const [formErrors, setFormErrors] = useState<{ foto?: string; escolaAvulsa?: string }>({});
  const [usarEscolaAvulsa, setUsarEscolaAvulsa] = useState(false);
  const [escolaAvulsaNome, setEscolaAvulsaNome] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [fotoPedido, setFotoPedido] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [reenviarNotaId, setReenviarNotaId] = useState<string | null>(null);

  const [selectedNota, setSelectedNota] = useState<NotaPedido | null>(null);
  const [conferenciaItens, setConferenciaItens] = useState<ItemForm[]>([]);
  const [conferenciaInstId, setConferenciaInstId] = useState("");
  const [conferenciaLocal, setConferenciaLocal] = useState("");
  const [conferenciaAssinatura, setConferenciaAssinatura] = useState("");
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [conferirErrors, setConferirErrors] = useState<{ assinatura?: string; itens?: string }>({});
  const [instituicaoPadraoId, setInstituicaoPadraoIdState] = useState("");
  const [alterarInstConferencia, setAlterarInstConferencia] = useState(false);

  const [avulsoModal, setAvulsoModal] = useState(false);
  const [avulsoCooperadoId, setAvulsoCooperadoId] = useState("");
  const [avulsoNovoNome, setAvulsoNovoNome] = useState("");
  const [avulsoInstId, setAvulsoInstId] = useState("");
  const [avulsoDataEntrega, setAvulsoDataEntrega] = useState("");
  const [avulsoAssinatura, setAvulsoAssinatura] = useState("");
  const [avulsoItens, setAvulsoItens] = useState<ItemForm[]>([]);
  const [avulsoErrors, setAvulsoErrors] = useState<{ cooperado?: string; instituicao?: string; assinatura?: string; itens?: string }>({});

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const notas = useMemo(() => {
    if (!data) return [];
    return data.notasPedido
      .filter((n) => {
        if (coopId && n.cooperativaId !== coopId) return false;
        if (isCooperado && cooperadoId && n.cooperadoId !== cooperadoId) return false;
        if (statusFilter && n.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data, coopId, isCooperado, cooperadoId, statusFilter]);

  const pendentesAnalise = useMemo(() => notas.filter((n) => n.status === "aguardando_conferencia"), [notas]);
  const instituicoes = useMemo(() => {
    if (!data || !coopId) return [];
    return data.instituicoes.filter((i) => i.cooperativaId === coopId);
  }, [data, coopId]);

  const cooperadosAvulso = useMemo(() => {
    if (!data || !coopId) return [];
    return data.cooperados.filter((c) => c.cooperativaId === coopId && c.status === "ativo" && c.avulso);
  }, [data, coopId]);

  useEffect(() => {
    if (!coopId || isCooperado) return;
    const saved = getInstituicaoPadraoId(coopId);
    if (saved && instituicoes.some((i) => i.id === saved)) {
      setInstituicaoPadraoIdState(saved);
    } else if (instituicoes.length === 1) {
      setInstituicaoPadraoIdState(instituicoes[0].id);
      setInstituicaoPadraoId(coopId, instituicoes[0].id);
    }
  }, [coopId, isCooperado, instituicoes]);

  const instituicaoPadraoNome = useMemo(() => {
    return instituicoes.find((i) => i.id === instituicaoPadraoId)?.nome ?? "";
  }, [instituicoes, instituicaoPadraoId]);

  const conferenciaInstNome = useMemo(() => {
    return instituicoes.find((i) => i.id === conferenciaInstId)?.nome ?? "";
  }, [instituicoes, conferenciaInstId]);

  const handleInstituicaoPadraoChange = (instId: string) => {
    setInstituicaoPadraoIdState(instId);
    if (coopId && instId) setInstituicaoPadraoId(coopId, instId);
  };

  const handleConferenciaInstChange = (instId: string) => {
    setConferenciaInstId(instId);
    setAlterarInstConferencia(false);
    if (coopId && instId) setInstituicaoPadraoId(coopId, instId);
    setInstituicaoPadraoIdState(instId);
  };

  useEffect(() => {
    if (searchParams.get("anexar") === "1" && isCooperado) openAnexar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isCooperado]);

  useEffect(() => {
    if (!data || !instituicaoId) return;
    const inst = data.instituicoes.find((i) => i.id === instituicaoId);
    setLocalEntrega(inst?.localEntrega ?? inst?.endereco ?? "");
  }, [instituicaoId, data]);

  useEffect(() => {
    if (!data || !conferenciaInstId) {
      setConferenciaItens([]);
      return;
    }
    const inst = data.instituicoes.find((i) => i.id === conferenciaInstId);
    setConferenciaLocal(inst?.localEntrega ?? inst?.endereco ?? "");
    setConferenciaItens(loadItensFromInstituicao(data, conferenciaInstId, selectedNota?.itens));
  }, [conferenciaInstId, data, selectedNota]);

  useEffect(() => {
    if (!data || !avulsoInstId) {
      setAvulsoItens([]);
      return;
    }
    setAvulsoItens(loadItensFromInstituicao(data, avulsoInstId));
  }, [avulsoInstId, data]);

  const avulsoTotais = useMemo(() => {
    if (!data) return { liquido: 0 };
    const r = calcularItensNota(
      avulsoItens.map((i) => ({ ...i, valorBruto: i.quantidade * i.precoUnitario })),
      data.config.descontoPadraoCooperativa
    );
    return { liquido: r.valorLiquido };
  }, [avulsoItens, data]);

  const conferenciaTotais = useMemo(() => {
    if (!data) return { liquido: 0 };
    const r = calcularItensNota(
      conferenciaItens.map((i) => ({ ...i, valorBruto: i.quantidade * i.precoUnitario })),
      data.config.descontoPadraoCooperativa
    );
    return { liquido: r.valorLiquido, bruto: r.valorBruto, desconto: r.valorDesconto };
  }, [conferenciaItens, data]);

  const openAnexar = (notaRejeitada?: NotaPedido) => {
    setFormErrors({});
    setReenviarNotaId(notaRejeitada?.id ?? null);
    setInstituicaoId(notaRejeitada?.instituicaoId ?? "");
    setUsarEscolaAvulsa(Boolean(notaRejeitada?.escolaAvulsaNome?.trim()));
    setEscolaAvulsaNome(notaRejeitada?.escolaAvulsaNome ?? "");
    setFotoPedido("");
    setObservacoes(notaRejeitada?.observacoes ?? "");
    setAnexarModal(true);
  };

  const openLancarAvulso = () => {
    const instId = instituicaoPadraoId || instituicoes[0]?.id || "";
    setAvulsoCooperadoId(cooperadosAvulso[0]?.id ?? NOVO_AVULSO);
    setAvulsoNovoNome("");
    setAvulsoInstId(instId);
    setAvulsoDataEntrega(new Date().toISOString().split("T")[0]);
    setAvulsoAssinatura("");
    setAvulsoErrors({});
    setAvulsoModal(true);
  };

  const updateAvulsoQty = (idx: number, qty: number) => {
    setAvulsoItens((prev) => prev.map((item, i) => (i === idx ? { ...item, quantidade: qty } : item)));
    setAvulsoErrors((e) => ({ ...e, itens: undefined }));
  };

  const handleLancarAvulso = () => {
    if (!user || !data || !coopId) return;
    const errors: typeof avulsoErrors = {};
    const usarNovo = avulsoCooperadoId === NOVO_AVULSO || cooperadosAvulso.length === 0;
    if (usarNovo && !avulsoNovoNome.trim()) errors.cooperado = "Informe o nome do cooperado avulso.";
    if (!usarNovo && !avulsoCooperadoId) errors.cooperado = "Escolha o cooperado avulso.";
    if (!avulsoInstId) errors.instituicao = "Escolha a instituição.";
    if (!avulsoAssinatura.trim()) errors.assinatura = "Informe quem assinou na escola.";
    if (avulsoTotais.liquido <= 0) errors.itens = "Informe a quantidade de pelo menos um produto.";
    if (Object.keys(errors).length) {
      setAvulsoErrors(errors);
      return;
    }

    const inst = data.instituicoes.find((i) => i.id === avulsoInstId);
    const local = inst?.localEntrega ?? inst?.endereco ?? "";
    const now = new Date().toISOString();
    const mes = getCurrentMesReferencia();

    updateData((d) => {
      let cooperados = d.cooperados;
      let cooperadoId = avulsoCooperadoId;
      if (usarNovo) {
        const novo: Cooperado = {
          id: generateId("c"),
          cooperativaId: coopId,
          nomeCompleto: avulsoNovoNome.trim(),
          cpfCnpj: "",
          telefone: "",
          endereco: "",
          comunidade: "",
          cafDap: "",
          chavePix: "",
          banco: "",
          agencia: "",
          conta: "",
          status: "ativo",
          avulso: true,
          produtos: [],
          observacoes: "",
          createdAt: now,
          updatedAt: now,
        };
        cooperados = [...cooperados, novo];
        cooperadoId = novo.id;
      }

      const baseNota: NotaPedido = {
        id: generateId("np"),
        cooperativaId: coopId,
        cooperadoId,
        instituicaoId: avulsoInstId,
        numeroNota: gerarNumeroNota({ ...d, cooperados }, coopId),
        dataEntrega: avulsoDataEntrega || now.split("T")[0],
        localEntrega: local,
        itens: [],
        valorBruto: 0,
        percentualDescontoCooperativa: d.config.descontoPadraoCooperativa,
        valorDesconto: 0,
        valorLiquido: 0,
        status: "conferida",
        lancamentoDireto: true,
        assinaturaRecebedor: avulsoAssinatura.trim(),
        dataAssinatura: avulsoDataEntrega || now.split("T")[0],
        conferidaPor: user.name,
        dataConferencia: now.split("T")[0],
        mesReferencia: mes,
        createdAt: now,
        updatedAt: now,
      };

      const nota = aplicarItensNaNota(
        baseNota,
        avulsoItens.map((i) => ({ ...i, valorBruto: 0 })),
        d.config.descontoPadraoCooperativa
      );

      if (coopId && avulsoInstId) setInstituicaoPadraoId(coopId, avulsoInstId);

      const ficha = buildFichaFromNota(nota, { ...d, cooperados }, user.name);
      return addAuditEntry(
        {
          ...d,
          cooperados,
          notasPedido: [...d.notasPedido, nota],
          fichaCorrida: [...d.fichaCorrida, ficha],
        },
        {
          entityType: "nota_pedido",
          entityId: nota.id,
          action: "aprovar",
          userId: user.id,
          userName: user.name,
          changes: "Lançamento avulso sem nota",
        }
      );
    });

    setAvulsoModal(false);
    setLancadoMsg(`Entrega avulsa registrada! ${formatCurrency(avulsoTotais.liquido)} na ficha do cooperado.`);
    setTimeout(() => setLancadoMsg(""), 6000);
  };

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFotoPedido(reader.result as string);
      setFormErrors((prev) => ({ ...prev, foto: undefined }));
    };
    reader.readAsDataURL(file);
  };

  const handleAnexarEntrega = () => {
    if (!data || !user || !coopId || !cooperadoId) return;
    const errors: typeof formErrors = {};
    if (usarEscolaAvulsa && !escolaAvulsaNome.trim()) {
      errors.escolaAvulsa = "Informe o nome da escola.";
    }
    if (!fotoPedido) errors.foto = "Tire ou escolha a foto do pedido assinado.";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    const escolaAvulsa = usarEscolaAvulsa ? escolaAvulsaNome.trim() : undefined;
    const local = escolaAvulsa ?? "";

    const now = new Date().toISOString();
    const mes = getCurrentMesReferencia();

    updateData((d) => {
      if (reenviarNotaId) {
        const updated = d.notasPedido.map((n) =>
          n.id === reenviarNotaId
            ? {
                ...n,
                instituicaoId: "",
                localEntrega: local,
                escolaAvulsaNome: escolaAvulsa,
                fotoPedido,
                fotoEnviadaEm: now,
                observacoes,
                status: "aguardando_conferencia" as const,
                motivoRejeicao: undefined,
                rejeitadaPor: undefined,
                dataRejeicao: undefined,
                reenviadaEm: now,
                updatedAt: now,
              }
            : n
        );
        return addAuditEntry({ ...d, notasPedido: updated }, {
          entityType: "nota_pedido", entityId: reenviarNotaId, action: "editar",
          userId: user.id, userName: user.name, changes: "Entrega reenviada",
        });
      }
      const nota: NotaPedido = {
        id: generateId("np"),
        cooperativaId: coopId,
        cooperadoId: cooperadoId,
        instituicaoId: "",
        numeroNota: gerarNumeroNota(d, coopId),
        dataEntrega: now.split("T")[0],
        localEntrega: local,
        escolaAvulsaNome: escolaAvulsa,
        itens: [],
        valorBruto: 0,
        percentualDescontoCooperativa: d.config.descontoPadraoCooperativa,
        valorDesconto: 0,
        valorLiquido: 0,
        status: "aguardando_conferencia",
        fotoPedido,
        fotoEnviadaEm: now,
        mesReferencia: mes,
        observacoes,
        createdAt: now,
        updatedAt: now,
      };
      return addAuditEntry({ ...d, notasPedido: [...d.notasPedido, nota] }, {
        entityType: "nota_pedido", entityId: nota.id, action: "criar",
        userId: user.id, userName: user.name,
      });
    });

    setAnexarModal(false);
    setSuccessMsg("Pronto! Aguarde enquanto a cooperativa analisa sua entrega.");
  };

  const openConferir = (nota: NotaPedido) => {
    setSelectedNota(nota);
    const instId = coopId
      ? resolverInstituicaoConferencia(coopId, instituicoes, nota.instituicaoId)
      : nota.instituicaoId;
    setConferenciaInstId(instId);
    setAlterarInstConferencia(false);
    setConferenciaAssinatura(nota.assinaturaRecebedor ?? "");
    setConferirStep(1);
    setConferirErrors({});
    setConferirModal(true);
  };

  const openView = (nota: NotaPedido) => {
    setSelectedNota(nota);
    setViewModal(true);
  };

  const updateConferenciaQty = (idx: number, qty: number) => {
    setConferenciaItens((prev) => prev.map((item, i) => (i === idx ? { ...item, quantidade: qty } : item)));
    setConferirErrors((e) => ({ ...e, itens: undefined }));
  };

  const handleLancarNota = () => {
    if (!user || !data || !selectedNota) return;
    const errors: typeof conferirErrors = {};
    if (!conferenciaAssinatura.trim()) errors.assinatura = "Informe quem assinou na escola.";
    if (conferenciaTotais.liquido <= 0) errors.itens = "Informe a quantidade de pelo menos um produto.";
    if (Object.keys(errors).length) {
      setConferirErrors(errors);
      setConferirStep(2);
      return;
    }

    updateData((d) => {
      const now = new Date().toISOString();
      if (coopId && conferenciaInstId) setInstituicaoPadraoId(coopId, conferenciaInstId);
      const base = aplicarItensNaNota(
        {
          ...selectedNota,
          instituicaoId: conferenciaInstId,
          localEntrega: conferenciaLocal,
          assinaturaRecebedor: conferenciaAssinatura,
          dataAssinatura: now.split("T")[0],
        },
        conferenciaItens.map((i) => ({ ...i, valorBruto: 0 })),
        d.config.descontoPadraoCooperativa
      );
      const notaAtualizada: NotaPedido = {
        ...base,
        status: "conferida",
        conferidaPor: user.name,
        dataConferencia: now.split("T")[0],
      };
      const ficha = buildFichaFromNota(notaAtualizada, d, user.name);
      return addAuditEntry(
        {
          ...d,
          notasPedido: d.notasPedido.map((n) => (n.id === selectedNota.id ? notaAtualizada : n)),
          fichaCorrida: [...d.fichaCorrida, ficha],
        },
        { entityType: "nota_pedido", entityId: selectedNota.id, action: "aprovar", userId: user.id, userName: user.name }
      );
    });

    setConferirModal(false);
    setLancadoMsg(`Nota aprovada! ${formatCurrency(conferenciaTotais.liquido)} lançado na ficha do cooperado.`);
    setTimeout(() => setLancadoMsg(""), 6000);
  };

  const handleRejeitarNota = () => {
    if (!user || !selectedNota || !motivoRejeicao.trim()) return;
    const now = new Date().toISOString();
    updateData((d) => {
      const notaAtualizada: NotaPedido = {
        ...selectedNota,
        status: "rejeitada",
        rejeitadaPor: user.name,
        dataRejeicao: now.split("T")[0],
        motivoRejeicao: motivoRejeicao.trim(),
        updatedAt: now,
      };
      return addAuditEntry(
        { ...d, notasPedido: d.notasPedido.map((n) => (n.id === selectedNota.id ? notaAtualizada : n)) },
        { entityType: "nota_pedido", entityId: selectedNota.id, action: "editar", userId: user.id, userName: user.name }
      );
    });
    setRejectModal(false);
    setConferirModal(false);
    setMotivoRejeicao("");
    setLancadoMsg("Pedido de correção enviado ao cooperado.");
    setTimeout(() => setLancadoMsg(""), 5000);
  };

  const mesAtual = getCurrentMesReferencia();

  if (!data) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const renderMobileCard = (n: NotaPedido) => {
    const escola = getEscolaNotaLabel(n, data.instituicoes);
    return (
      <button
        type="button"
        onClick={() => (isCooperado ? openView(n) : n.status === "aguardando_conferencia" ? openConferir(n) : openView(n))}
        className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-green-300 transition-colors"
      >
        <div className="flex gap-3">
          {n.fotoPedido ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.fotoPedido} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-400">
              {n.lancamentoDireto ? <FileText size={20} /> : <Camera size={20} />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-gray-900 truncate">{escola}</p>
              <NotaStatusBadge status={n.status} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{formatDate(n.dataEntrega)} · {n.numeroNota}</p>
            {n.lancamentoDireto && (
              <p className="text-xs text-amber-700 mt-0.5">Avulso · sem nota</p>
            )}
            {!isCooperado && <p className="text-xs text-gray-600 mt-0.5">{getCooperadoNome(data.cooperados, n.cooperadoId)}</p>}
            {n.status === "rejeitada" && n.motivoRejeicao && (
              <p className="text-xs text-red-600 mt-1 line-clamp-2">{n.motivoRejeicao}</p>
            )}
            {n.valorLiquido > 0 && (
              <p className="text-sm font-semibold text-green-700 mt-1">{formatCurrency(n.valorLiquido)}</p>
            )}
          </div>
          <ChevronRight size={18} className="text-gray-300 shrink-0 self-center" />
        </div>
        {isCooperado && n.status === "rejeitada" && (
          <Button size="sm" className="w-full mt-3" variant="secondary" onClick={(e) => { e.stopPropagation(); openAnexar(n); }}>
            <RefreshCw size={16} /> Enviar de novo
          </Button>
        )}
      </button>
    );
  };

  return (
    <div className="relative pb-20 lg:pb-0">
      <PageHeader
        title={isCooperado ? "Minhas entregas" : "Conferir entregas"}
        subtitle={isCooperado ? "Envie uma foto para cada entrega na escola" : "Analise fotos, lance produtos ou registre entregas avulsas sem nota"}
        action={isCooperado ? (
          <Button size="lg" onClick={() => openAnexar()} className="hidden sm:inline-flex">
            <Camera size={18} /> Enviar foto
          </Button>
        ) : check("notas_pedido", "create") ? (
          <Button size="lg" onClick={openLancarAvulso}>
            <UserPlus size={18} /> Lançar avulso
          </Button>
        ) : undefined}
      />

      {successMsg && (
        <AlertBanner variant="success" title="Entrega enviada!" onDismiss={() => setSuccessMsg("")}>
          {successMsg}
        </AlertBanner>
      )}
      {lancadoMsg && (
        <AlertBanner variant="success" className="mt-4" onDismiss={() => setLancadoMsg("")}>{lancadoMsg}</AlertBanner>
      )}

      {!isCooperado && instituicoes.length > 0 && (
        <Card className="mb-6 border-green-200 bg-green-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Building2 size={20} className="text-green-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Instituição das entregas</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Escolha uma vez — ao conferir, os itens e preços do contrato carregam automaticamente.
                </p>
              </div>
            </div>
            <div className="sm:w-72 shrink-0">
              <Select
                value={instituicaoPadraoId}
                onChange={(e) => handleInstituicaoPadraoChange(e.target.value)}
              >
                <option value="">Selecione a instituição...</option>
                {instituicoes.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome}</option>
                ))}
              </Select>
            </div>
          </div>
          {instituicaoPadraoNome && (
            <p className="text-sm text-green-800 mt-3 font-medium">
              Padrão atual: {instituicaoPadraoNome}
            </p>
          )}
        </Card>
      )}

      {!isCooperado && instituicoes.length === 0 && (
        <AlertBanner variant="warning" className="mb-6" title="Cadastre uma instituição primeiro">
          Para lançar entregas com preços automáticos, cadastre escolas e itens em{" "}
          <Link href="/contratos" className="font-semibold underline">Contratos</Link>.
        </AlertBanner>
      )}

      {!isCooperado && pendentesAnalise.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Toque para conferir ({pendentesAnalise.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendentesAnalise.map((n) => (
              <button key={n.id} type="button" onClick={() => openConferir(n)} className="text-left border-2 border-amber-300 bg-amber-50 rounded-xl overflow-hidden hover:border-amber-500">
                {n.fotoPedido && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.fotoPedido} alt="" className="w-full h-36 object-cover" />
                )}
                <div className="p-3">
                  <p className="font-medium text-sm">{getCooperadoNome(data.cooperados, n.cooperadoId)}</p>
                  <p className="text-xs text-gray-600">{getEscolaNotaLabel(n, data.instituicoes)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isCooperado && (
        <p className="text-sm text-gray-600 mb-4">
          Entregas de {formatMesReferencia(mesAtual)} — após aprovação, veja valores em{" "}
          <Link href="/ficha-corrida" className="text-green-700 font-medium">Quanto vou receber</Link>.
        </p>
      )}

      <FilterBar>
        <FormField label="Filtrar">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="aguardando_conferencia">Em análise</option>
            <option value="rejeitada">Precisa corrigir</option>
            <option value="conferida">Aprovadas</option>
            <option value="pago">Pagas</option>
          </Select>
        </FormField>
      </FilterBar>

      <DataTable
        data={notas}
        keyField="id"
        mobileCard={renderMobileCard}
        emptyMessage={isCooperado ? "Nenhuma entrega ainda. Toque em \"Enviar foto\" para registrar." : "Nenhuma entrega registrada."}
        columns={[
          { key: "numero", label: "Nota", render: (n) => n.numeroNota },
          { key: "data", label: "Data", render: (n) => formatDate(n.dataEntrega) },
          ...(!isCooperado ? [{ key: "coop", label: "Cooperado", render: (n: NotaPedido) => getCooperadoNome(data.cooperados, n.cooperadoId) }] : []),
          { key: "escola", label: "Escola", render: (n) => getEscolaNotaLabel(n, data.instituicoes) },
          {
            key: "tipo",
            label: "Tipo",
            render: (n) => (n.lancamentoDireto ? <span className="text-xs text-amber-700 font-medium">Avulso</span> : "Com nota"),
          },
          { key: "valor", label: "Valor", render: (n) => (n.valorLiquido > 0 ? formatCurrency(n.valorLiquido) : "—") },
          { key: "status", label: "Status", render: (n) => <NotaStatusBadge status={n.status} /> },
        ]}
        onView={isCooperado ? openView : (n) => (n.status === "aguardando_conferencia" ? openConferir(n) : openView(n))}
        viewLabel={isCooperado ? "Ver" : "Conferir"}
      />

      {isCooperado && (
        <Button size="lg" className="fixed bottom-20 right-4 sm:hidden shadow-lg z-30 rounded-full px-5" onClick={() => openAnexar()}>
          <Camera size={20} /> Enviar foto
        </Button>
      )}

      <Modal open={anexarModal} onClose={() => setAnexarModal(false)} title={reenviarNotaId ? "Enviar de novo" : "Enviar foto da entrega"} size="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="secondary" onClick={() => setAnexarModal(false)}>Cancelar</Button>
            <Button size="lg" onClick={handleAnexarEntrega}><FileText size={18} /> Enviar para a cooperativa</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A escola aparece na foto do pedido. A cooperativa confere pelo documento — não precisa escolher aqui.
          </p>
          <FormField label="Foto do pedido assinado" required error={formErrors.foto} hint="Mostre o pedido inteiro com a assinatura de quem recebeu.">
            <label className="flex flex-col items-center gap-2 p-8 border-2 border-dashed border-green-400 rounded-2xl cursor-pointer bg-green-50/50 active:bg-green-100">
              <Camera size={48} className="text-green-700" />
              <span className="text-base font-semibold text-green-800">Tirar foto agora</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
            </label>
            {fotoPedido && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoPedido} alt="Preview" className="mt-3 w-full max-h-56 object-contain rounded-xl border" />
            )}
          </FormField>
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={usarEscolaAvulsa}
                onChange={(e) => {
                  setUsarEscolaAvulsa(e.target.checked);
                  if (!e.target.checked) {
                    setEscolaAvulsaNome("");
                    setFormErrors((p) => ({ ...p, escolaAvulsa: undefined }));
                  }
                }}
                className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Entrega em outra escola</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Opcional — use se a escola não estiver no contrato ou quiser informar o nome.
                </span>
              </span>
            </label>
            {usarEscolaAvulsa && (
              <FormField label="Nome da escola" required error={formErrors.escolaAvulsa}>
                <Input
                  value={escolaAvulsaNome}
                  onChange={(e) => {
                    setEscolaAvulsaNome(e.target.value);
                    setFormErrors((p) => ({ ...p, escolaAvulsa: undefined }));
                  }}
                  placeholder="Ex: EMEF Prof. Maria Silva"
                />
              </FormField>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={avulsoModal}
        onClose={() => setAvulsoModal(false)}
        title="Lançar entrega avulsa"
        size="xl"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="secondary" onClick={() => setAvulsoModal(false)}>Cancelar</Button>
            <Button size="lg" onClick={handleLancarAvulso}>
              <CheckCircle size={18} /> Registrar entrega
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Para cooperados que não usam o app. Lance produtos e valores direto, sem foto de nota.
          </p>

          <FormField label="Cooperado avulso" required error={avulsoErrors.cooperado}>
            {cooperadosAvulso.length > 0 ? (
              <Select
                value={avulsoCooperadoId}
                onChange={(e) => {
                  setAvulsoCooperadoId(e.target.value);
                  setAvulsoErrors((p) => ({ ...p, cooperado: undefined }));
                }}
              >
                {cooperadosAvulso.map((c) => (
                  <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
                ))}
                <option value={NOVO_AVULSO}>+ Informar outro nome...</option>
              </Select>
            ) : (
              <p className="text-xs text-gray-500 mb-2">
                Nenhum avulso cadastrado — informe o nome abaixo ou cadastre em{" "}
                <Link href="/cooperados" className="text-green-700 font-medium underline">Cooperados</Link>.
              </p>
            )}
            {(avulsoCooperadoId === NOVO_AVULSO || cooperadosAvulso.length === 0) && (
              <Input
                className="mt-2"
                value={avulsoNovoNome}
                onChange={(e) => {
                  setAvulsoNovoNome(e.target.value);
                  setAvulsoErrors((p) => ({ ...p, cooperado: undefined }));
                }}
                placeholder="Nome do cooperado avulso"
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Instituição" required error={avulsoErrors.instituicao}>
              <Select
                value={avulsoInstId}
                onChange={(e) => {
                  setAvulsoInstId(e.target.value);
                  setAvulsoErrors((p) => ({ ...p, instituicao: undefined }));
                }}
              >
                <option value="">Selecione...</option>
                {instituicoes.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Data da entrega">
              <Input
                type="date"
                value={avulsoDataEntrega}
                onChange={(e) => setAvulsoDataEntrega(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Quem assinou na escola?" required error={avulsoErrors.assinatura}>
            <Input
              value={avulsoAssinatura}
              onChange={(e) => {
                setAvulsoAssinatura(e.target.value);
                setAvulsoErrors((p) => ({ ...p, assinatura: undefined }));
              }}
              placeholder="Nome de quem recebeu"
            />
          </FormField>

          {avulsoItens.length === 0 ? (
            <AlertBanner variant="warning">
              Esta instituição ainda não tem produtos.{" "}
              <Link href="/contratos" className="font-semibold underline">Cadastrar em Contratos</Link>
            </AlertBanner>
          ) : (
            <>
              {avulsoErrors.itens && <p className="text-sm text-red-600">{avulsoErrors.itens}</p>}
              <p className="text-sm text-gray-600">Quantidades — preços do contrato:</p>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {avulsoItens.map((item, idx) => (
                  <div key={item.produtoInstituicaoId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.produtoNome}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(item.precoUnitario)} / {labelUnidade(item.unidade)}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-24 text-center text-lg"
                      value={item.quantidade || ""}
                      onChange={(e) => updateAvulsoQty(idx, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-right text-lg font-bold text-green-700">Total: {formatCurrency(avulsoTotais.liquido)}</p>
            </>
          )}
        </div>
      </Modal>

      <Modal open={conferirModal} onClose={() => setConferirModal(false)} title="Conferir entrega" size="xl"
        footer={selectedNota?.status === "aguardando_conferencia" && check("notas_pedido", "approve") ? (
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <Button variant="danger" onClick={() => { setMotivoRejeicao(""); setRejectModal(true); }}>
              <XCircle size={18} /> Pedir correção
            </Button>
            <div className="flex gap-2">
              {conferirStep > 1 && <Button variant="secondary" onClick={() => setConferirStep(1)}>Voltar</Button>}
              {conferirStep < 2 ? (
                <Button onClick={() => setConferirStep(2)}>Próximo: produtos</Button>
              ) : (
                <Button onClick={handleLancarNota}><CheckCircle size={18} /> Aprovar e registrar</Button>
              )}
            </div>
          </div>
        ) : undefined}
      >
        {selectedNota && (
          <>
            <div className="flex gap-2 mb-4">
              {[1, 2].map((s) => (
                <span key={s} className={`text-xs px-3 py-1 rounded-full ${conferirStep === s ? "bg-green-700 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {s === 1 ? "1. Ver foto" : "2. Produtos"}
                </span>
              ))}
            </div>
            {conferirStep === 1 ? (
              <div>
                {selectedNota.fotoPedido ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedNota.fotoPedido} alt="Pedido" className="w-full max-h-[50vh] object-contain rounded-xl border bg-gray-50" />
                ) : (
                  <p className="text-gray-500 text-center py-12">Sem foto</p>
                )}
                <p className="mt-3 text-sm">
                  <strong>{getCooperadoNome(data.cooperados, selectedNota.cooperadoId)}</strong> · {formatDate(selectedNota.dataEntrega)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Escola: {getEscolaNotaLabel(selectedNota, data.instituicoes)}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Instituição</p>
                      {!alterarInstConferencia ? (
                        <>
                          <p className="font-semibold text-gray-900 mt-1">{conferenciaInstNome || "—"}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Itens e preços unitários carregados do contrato desta escola.
                          </p>
                        </>
                      ) : (
                        <div className="mt-2">
                          <FormField label="Escolher outra instituição">
                            <Select
                              value={conferenciaInstId}
                              onChange={(e) => handleConferenciaInstChange(e.target.value)}
                            >
                              {instituicoes.map((i) => (
                                <option key={i.id} value={i.id}>{i.nome}</option>
                              ))}
                            </Select>
                          </FormField>
                        </div>
                      )}
                    </div>
                    {!alterarInstConferencia && instituicoes.length > 1 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setAlterarInstConferencia(true)}
                      >
                        <Pencil size={14} /> Trocar
                      </Button>
                    )}
                  </div>
                  {conferenciaLocal && (
                    <p className="text-xs text-gray-500 mt-2">Local: {conferenciaLocal}</p>
                  )}
                </div>
                <FormField label="Quem assinou na escola?" required error={conferirErrors.assinatura}>
                  <Input value={conferenciaAssinatura} onChange={(e) => setConferenciaAssinatura(e.target.value)} placeholder="Nome de quem recebeu" />
                </FormField>
                {conferenciaItens.length === 0 ? (
                  <AlertBanner variant="warning">
                    Esta instituição ainda não tem produtos cadastrados.{" "}
                    <Link href="/contratos" className="font-semibold underline">Cadastrar em Contratos</Link>
                  </AlertBanner>
                ) : (
                  <>
                    {conferirErrors.itens && <p className="text-sm text-red-600">{conferirErrors.itens}</p>}
                    <p className="text-sm text-gray-600">Informe apenas as quantidades — os preços já vêm do contrato:</p>
                    <div className="space-y-3">
                      {conferenciaItens.map((item, idx) => (
                        <div key={item.produtoInstituicaoId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{item.produtoNome}</p>
                            <p className="text-xs text-gray-500">{formatCurrency(item.precoUnitario)} / {labelUnidade(item.unidade)}</p>
                          </div>
                          <Input type="number" min={0} step="0.01" className="w-24 text-center text-lg" value={item.quantidade || ""} onChange={(e) => updateConferenciaQty(idx, parseFloat(e.target.value) || 0)} />
                        </div>
                      ))}
                    </div>
                    <p className="text-right text-lg font-bold text-green-700">Total: {formatCurrency(conferenciaTotais.liquido)}</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      <PromptDialog
        open={rejectModal}
        onClose={() => setRejectModal(false)}
        title="Pedir correção ao cooperado"
        label="O que precisa ser corrigido?"
        placeholder="Explique de forma simples..."
        confirmLabel="Enviar ao cooperado"
        suggestions={REJEICAO_SUGESTOES}
        value={motivoRejeicao}
        onChange={setMotivoRejeicao}
        onConfirm={handleRejeitarNota}
      />

      <Modal open={viewModal} onClose={() => setViewModal(false)} title="Detalhes da entrega" size="md">
        {selectedNota && (
          <div className="space-y-4">
            <NotaStatusBadge status={selectedNota.status} />
            {selectedNota.lancamentoDireto && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Lançamento avulso pela cooperativa, sem foto de nota.
              </p>
            )}
            <p className="text-sm"><strong>Cooperado:</strong> {getCooperadoNome(data.cooperados, selectedNota.cooperadoId)}</p>
            <p className="text-sm"><strong>Escola:</strong> {getEscolaNotaLabel(selectedNota, data.instituicoes)}</p>
            <p className="text-sm"><strong>Data:</strong> {formatDate(selectedNota.dataEntrega)}</p>
            {selectedNota.assinaturaRecebedor && (
              <p className="text-sm"><strong>Assinatura:</strong> {selectedNota.assinaturaRecebedor}</p>
            )}
            {selectedNota.itens.length > 0 && (
              <ul className="text-sm space-y-1 border rounded-lg p-3 bg-gray-50">
                {selectedNota.itens.map((item) => (
                  <li key={item.produtoInstituicaoId} className="flex justify-between gap-2">
                    <span>{item.produtoNome} ({item.quantidade} {labelUnidade(item.unidade)})</span>
                    <span className="font-medium">{formatCurrency(item.valorBruto)}</span>
                  </li>
                ))}
              </ul>
            )}
            {selectedNota.valorLiquido > 0 && (
              <p className="text-right font-bold text-green-700">{formatCurrency(selectedNota.valorLiquido)}</p>
            )}
            {selectedNota.motivoRejeicao && (
              <AlertBanner variant="error" title="Motivo da correção">{selectedNota.motivoRejeicao}</AlertBanner>
            )}
            {selectedNota.fotoPedido && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedNota.fotoPedido} alt="Pedido" className="w-full rounded-xl border" />
            )}
            {selectedNota.status === "rejeitada" && (
              <Button className="w-full" onClick={() => { setViewModal(false); openAnexar(selectedNota); }}>
                <RefreshCw size={18} /> Enviar de novo
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
