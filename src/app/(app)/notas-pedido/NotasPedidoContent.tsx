"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Camera, CheckCircle, FileText, XCircle, RefreshCw, ChevronRight, Eye, Building2, Pencil, UserPlus, X, ImagePlus, Trash2, FileSignature,
} from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField, Textarea } from "@/components/ui/Form";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PromptDialog, ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { updateData, updateDataSafe, generateId, addAuditEntry, getData } from "@/services/dataStore";
import {
  calcularItensNota,
  gerarNumeroNota,
  buildFichaFromNota,
  aplicarItensNaNota,
  upsertArquivoMensal,
} from "@/services/notaPedidoService";
import {
  getCooperativaCnpj,
  patchNotaPedidoInCloud,
  pushNotasPedidoToCloud,
  syncNotasPedidoFromCloud,
  deleteNotaPedidoFromCloud,
  ensureNotaComFoto,
  resolveCooperativaCnpj,
} from "@/services/notaPedidoCloudService";
import { listCooperadosDaCooperativa, syncCooperadosFromCloud, pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { ensureContratoPnaePadrao, getContratoLabel, getContratosEntrega } from "@/utils/contratosEntrega";
import { cn, formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import { sortPorOrdemLancamento } from "@/utils/produtos";
import {
  getInstituicaoPadraoId,
  setInstituicaoPadraoId,
  resolverInstituicaoConferencia,
} from "@/utils/instituicaoPreferida";
import { getCooperadoNome } from "@/utils/calculations";
import { isFotoDuplicada, compressFotoFile, makeFotoThumbnail, getFotoExibicaoNota, notaPertenceCooperativa, compactarFotosNoArmazenamento, agruparPendentesPorCooperado, getChaveGrupoConferencia, notaPertenceGrupoConferencia } from "@/utils/fotoEntrega";
import type { NotaPedido, NotaPedidoItem, Cooperado, AppData } from "@/types";

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
  const filtroResponsavelIniciado = useRef(false);
  const [anexarModal, setAnexarModal] = useState(false);
  const [conferirModal, setConferirModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [lancadoMsg, setLancadoMsg] = useState("");

  const [formErrors, setFormErrors] = useState<{ foto?: string; escolaAvulsa?: string }>({});
  const [usarEscolaAvulsa, setUsarEscolaAvulsa] = useState(false);
  const [escolaAvulsaNome, setEscolaAvulsaNome] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [fotosSessao, setFotosSessao] = useState<string[]>([]);
  const [fotoDuplicadaMsg, setFotoDuplicadaMsg] = useState("");
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [reenviarNotaId, setReenviarNotaId] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [selectedNota, setSelectedNota] = useState<NotaPedido | null>(null);
  const [conferenciaItens, setConferenciaItens] = useState<ItemForm[]>([]);
  const [conferenciaCooperadoId, setConferenciaCooperadoId] = useState("");
  const [conferenciaDescontoPct, setConferenciaDescontoPct] = useState(5);
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

  const [filtroCooperadoId, setFiltroCooperadoId] = useState("");
  const [abaConferenciaKey, setAbaConferenciaKey] = useState("");
  const [contratoInstId, setContratoInstId] = useState("");
  const [excluirNotaTarget, setExcluirNotaTarget] = useState<NotaPedido | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const cooperadosCoop = useMemo(() => {
    if (!data || !coopId) return [];
    return listCooperadosDaCooperativa(data, coopId);
  }, [data, coopId]);

  useEffect(() => {
    const cid = searchParams.get("cooperado");
    if (cid && !isCooperado) {
      setFiltroCooperadoId(cid);
      setAbaConferenciaKey(`id:${cid}`);
    }
  }, [searchParams, isCooperado]);

  useEffect(() => {
    if (!isCooperado && !filtroResponsavelIniciado.current) {
      setStatusFilter("aguardando_conferencia");
      filtroResponsavelIniciado.current = true;
    }
  }, [isCooperado]);

  const notas = useMemo(() => {
    if (!data) return [];
    return data.notasPedido
      .filter((n) => {
        if (coopId && !notaPertenceCooperativa(data, n, coopId)) return false;
        if (isCooperado && cooperadoId && n.cooperadoId !== cooperadoId) return false;
        if (
          !isCooperado &&
          abaConferenciaKey &&
          statusFilter === "aguardando_conferencia" &&
          !notaPertenceGrupoConferencia(n, data, abaConferenciaKey)
        ) {
          return false;
        } else if (!isCooperado && filtroCooperadoId && n.cooperadoId !== filtroCooperadoId) {
          return false;
        }
        if (statusFilter && n.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data, coopId, isCooperado, cooperadoId, filtroCooperadoId, statusFilter, abaConferenciaKey]);


  const pendentesTodas = useMemo(() => {
    if (!data || isCooperado) return [];
    return data.notasPedido
      .filter((n) => {
        if (coopId && !notaPertenceCooperativa(data, n, coopId)) return false;
        return n.status === "aguardando_conferencia";
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data, coopId, isCooperado]);

  const pendentesPorCooperado = useMemo(() => {
    if (!data) return [];
    return agruparPendentesPorCooperado(data, pendentesTodas, coopId);
  }, [data, pendentesTodas, coopId]);

  const pendentesAbaAtiva = useMemo(() => {
    if (!abaConferenciaKey) return [];
    return pendentesPorCooperado.find((g) => g.chave === abaConferenciaKey)?.notas ?? [];
  }, [pendentesPorCooperado, abaConferenciaKey]);

  const grupoAbaAtiva = useMemo(
    () => pendentesPorCooperado.find((g) => g.chave === abaConferenciaKey),
    [pendentesPorCooperado, abaConferenciaKey]
  );

  useEffect(() => {
    if (isCooperado || pendentesPorCooperado.length === 0) return;
    const abaValida = pendentesPorCooperado.some((g) => g.chave === abaConferenciaKey);
    if (!abaValida) {
      const proxima = pendentesPorCooperado[0];
      setAbaConferenciaKey(proxima.chave);
      setFiltroCooperadoId(proxima.cooperadoId);
    }
  }, [pendentesPorCooperado, abaConferenciaKey, isCooperado]);

  useEffect(() => {
    if (isCooperado || !filtroCooperadoId) return;
    const grupo = pendentesPorCooperado.find((g) => g.cooperadoId === filtroCooperadoId);
    if (grupo) setAbaConferenciaKey(grupo.chave);
  }, [filtroCooperadoId, pendentesPorCooperado, isCooperado]);

  const selecionarAbaConferencia = (grupo: (typeof pendentesPorCooperado)[number]) => {
    setAbaConferenciaKey(grupo.chave);
    setFiltroCooperadoId(grupo.cooperadoId);
    if (statusFilter !== "aguardando_conferencia") {
      setStatusFilter("aguardando_conferencia");
    }
  };

  const instituicoes = useMemo(() => {
    if (!data || !coopId) return [];
    return data.instituicoes.filter((i) => i.cooperativaId === coopId);
  }, [data, coopId]);

  const contratosEntrega = useMemo(() => {
    if (!data || !coopId) return [];
    return getContratosEntrega(data, coopId);
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
    if (!data || !coopId || !user) return;
    void (async () => {
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (!cnpj) return;
      await syncCooperadosFromCloud(cnpj);
      await syncNotasPedidoFromCloud(cnpj);
    })();
    if (isCooperado) return;
    const id = setInterval(() => {
      void (async () => {
        const cnpj = await resolveCooperativaCnpj(data, coopId, user);
        if (!cnpj) return;
        await syncCooperadosFromCloud(cnpj);
        await syncNotasPedidoFromCloud(cnpj);
      })();
    }, 12000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coopId, isCooperado, user?.id]);

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
    if (!data) return { liquido: 0, bruto: 0, desconto: 0 };
    const r = calcularItensNota(
      conferenciaItens.map((i) => ({ ...i, valorBruto: i.quantidade * i.precoUnitario })),
      conferenciaDescontoPct
    );
    return { liquido: r.valorLiquido, bruto: r.valorBruto, desconto: r.valorDesconto };
  }, [conferenciaItens, conferenciaDescontoPct, data]);

  const openAnexar = (notaRejeitada?: NotaPedido) => {
    setFormErrors({});
    setErroEnvio("");
    setReenviarNotaId(notaRejeitada?.id ?? null);
    setInstituicaoId(notaRejeitada?.instituicaoId ?? "");
    setUsarEscolaAvulsa(Boolean(notaRejeitada?.escolaAvulsaNome?.trim()));
    setEscolaAvulsaNome(notaRejeitada?.escolaAvulsaNome ?? "");
    setFotosSessao([]);
    setFotoDuplicadaMsg("");
    setObservacoes(notaRejeitada?.observacoes ?? "");

    if (data && coopId && user) {
      const ensured = ensureContratoPnaePadrao(data, coopId);
      if (ensured.criou) {
        updateData(() => ensured.data);
      }
      const contratoId =
        notaRejeitada?.instituicaoId ||
        ensured.instituicaoId ||
        getContratosEntrega(ensured.data, coopId)[0]?.id ||
        "";
      setContratoInstId(contratoId);
    }

    setAnexarModal(true);
  };

  const openLancarAvulso = (preCooperadoId?: string) => {
    const instId = instituicaoPadraoId || instituicoes[0]?.id || "";
    const defaultCoop =
      preCooperadoId && cooperadosCoop.some((c) => c.id === preCooperadoId)
        ? preCooperadoId
        : cooperadosCoop[0]?.id ?? NOVO_AVULSO;
    setAvulsoCooperadoId(defaultCoop);
    setAvulsoNovoNome("");
    setAvulsoInstId(instId);
    setAvulsoDataEntrega(new Date().toISOString().split("T")[0]);
    setAvulsoAssinatura("");
    setAvulsoErrors({});
    setAvulsoModal(true);
  };

  useEffect(() => {
    if (searchParams.get("lancar") === "1" && !isCooperado && check("notas_pedido", "create")) {
      openLancarAvulso(searchParams.get("cooperado") ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isCooperado]);

  const updateAvulsoQty = (idx: number, qty: number) => {
    setAvulsoItens((prev) => prev.map((item, i) => (i === idx ? { ...item, quantidade: qty } : item)));
    setAvulsoErrors((e) => ({ ...e, itens: undefined }));
  };

  const handleLancarAvulso = () => {
    if (!user || !data || !coopId) return;
    const errors: typeof avulsoErrors = {};
    const usarNovo = avulsoCooperadoId === NOVO_AVULSO;
    if (usarNovo && !avulsoNovoNome.trim()) errors.cooperado = "Informe o nome do cooperado.";
    if (!usarNovo && !avulsoCooperadoId) errors.cooperado = "Escolha o cooperado.";
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
      const arquivosMensais = upsertArquivoMensal({ ...d, cooperados }, cooperadoId, coopId, mes, {
        notaPedidoIds: [nota.id],
      });
      return addAuditEntry(
        {
          ...d,
          cooperados,
          notasPedido: [...d.notasPedido, nota],
          fichaCorrida: [...d.fichaCorrida, ficha],
          arquivosMensais,
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

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data || !cooperadoId) return;

    setProcessandoFoto(true);
    setFotoDuplicadaMsg("");
    try {
      const dataUrl = await compressFotoFile(file);
      const notasCooperado = data.notasPedido.filter((n) => n.cooperadoId === cooperadoId);

      setFotosSessao((prev) => {
        if (isFotoDuplicada(dataUrl, prev, notasCooperado)) {
          setFotoDuplicadaMsg("Imagem repetida — esta foto já foi adicionada ou já foi enviada antes.");
          return prev;
        }
        setFormErrors((err) => ({ ...err, foto: undefined }));
        if (reenviarNotaId) return [dataUrl];
        return [...prev, dataUrl];
      });
    } catch {
      setErroEnvio("Não foi possível processar a foto. Tente outra imagem.");
    } finally {
      setProcessandoFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
  };

  const removerFotoSessao = (idx: number) => {
    setFotosSessao((prev) => prev.filter((_, i) => i !== idx));
    setFotoDuplicadaMsg("");
    setFormErrors((prev) => ({ ...prev, foto: undefined }));
  };

  const handleAnexarEntrega = async () => {
    if (!data || !user || !coopId) return;
    const cid = cooperadoId ?? user.cooperadoId;
    if (!cid) {
      setErroEnvio("Conta sem vínculo de cooperado. Faça login novamente ou fale com a cooperativa.");
      return;
    }

    const errors: typeof formErrors = {};
    if (usarEscolaAvulsa && !escolaAvulsaNome.trim()) {
      errors.escolaAvulsa = "Informe o nome da escola.";
    }
    if (fotosSessao.length === 0) errors.foto = "Tire ou escolha pelo menos uma foto do pedido assinado.";
    if (!contratoInstId) errors.foto = errors.foto ?? "Selecione o contrato da entrega.";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    const escolaAvulsa = usarEscolaAvulsa ? escolaAvulsaNome.trim() : undefined;
    const local = escolaAvulsa ?? "";
    const now = new Date().toISOString();
    const mes = getCurrentMesReferencia();
    const cooperadoNome = getCooperadoNome(data.cooperados, cid);
    const qtdFotos = fotosSessao.length;

    setEnviando(true);
    setErroEnvio("");

    const cnpj = await resolveCooperativaCnpj(data, coopId, user);
    if (!cnpj) {
      setEnviando(false);
      setErroEnvio(
        "CNPJ da cooperativa não encontrado. Faça logout e login de novo, ou peça ao responsável para conferir o cadastro."
      );
      return;
    }

    const cooperadoRecord = data.cooperados.find((c) => c.id === cid);
    if (cooperadoRecord) {
      void pushCooperadoToCloud(cnpj, { ...cooperadoRecord, updatedAt: now }, user.email);
    }

    const inst = data.instituicoes.find((i) => i.id === contratoInstId);
    const localEntrega = inst?.localEntrega ?? inst?.endereco ?? local;

    const buildNotasCompletas = (d: AppData): NotaPedido[] => {
      if (reenviarNotaId) {
        const base = d.notasPedido.find((n) => n.id === reenviarNotaId);
        if (!base) return [];
        return [{
          ...base,
          instituicaoId: contratoInstId,
          localEntrega,
          escolaAvulsaNome: escolaAvulsa,
          fotoPedido: fotosSessao[0],
          fotoEnviadaEm: now,
          observacoes,
          status: "aguardando_conferencia",
          motivoRejeicao: undefined,
          rejeitadaPor: undefined,
          dataRejeicao: undefined,
          reenviadaEm: now,
          updatedAt: now,
          cooperativaCnpj: cnpj,
          cooperadoNomeSnapshot: cooperadoNome,
        }];
      }

      let notas = [...d.notasPedido];
      const criadas: NotaPedido[] = [];
      for (const foto of fotosSessao) {
        const nota: NotaPedido = {
          id: generateId("np"),
          cooperativaId: coopId,
          cooperadoId: cid,
          instituicaoId: contratoInstId,
          numeroNota: gerarNumeroNota({ ...d, notasPedido: notas }, coopId),
          dataEntrega: now.split("T")[0],
          localEntrega,
          escolaAvulsaNome: escolaAvulsa,
          itens: [],
          valorBruto: 0,
          percentualDescontoCooperativa: d.config.descontoPadraoCooperativa,
          valorDesconto: 0,
          valorLiquido: 0,
          status: "aguardando_conferencia",
          fotoPedido: foto,
          fotoEnviadaEm: now,
          mesReferencia: mes,
          observacoes,
          cooperativaCnpj: cnpj,
          cooperadoNomeSnapshot: cooperadoNome,
          createdAt: now,
          updatedAt: now,
        };
        notas = [...notas, nota];
        criadas.push(nota);
      }
      return criadas;
    };

    const notasCompletas = buildNotasCompletas(data);
    if (notasCompletas.length === 0) {
      setEnviando(false);
      setErroEnvio("Não foi possível preparar o envio. Tente novamente.");
      return;
    }

    let cloudOk = false;
    const cloud = await pushNotasPedidoToCloud(cnpj, notasCompletas, cooperadoNome);
    if (!cloud.ok) {
      setEnviando(false);
      setErroEnvio(
        cloud.error ??
          (cloud.offline
            ? "Sem conexão com o servidor. Verifique a internet e tente novamente."
            : "Não foi possível enviar ao responsável.")
      );
      return;
    }
    cloudOk = true;

    const miniaturas = await Promise.all(
      notasCompletas.map((n) => (n.fotoPedido ? makeFotoThumbnail(n.fotoPedido) : Promise.resolve(undefined)))
    );

    const notasLocais = notasCompletas.map((n, i) => ({
      ...n,
      fotoNaNuvem: cloudOk,
      fotoPedidoMiniatura: miniaturas[i],
      fotoPedido: cloudOk ? undefined : n.fotoPedido,
    }));

    const persistir = (d: AppData) => {
      const base = compactarFotosNoArmazenamento(d);

      if (reenviarNotaId) {
        const local = notasLocais[0];
        const updated = base.notasPedido.map((n) => (n.id === reenviarNotaId ? local : n));
        return addAuditEntry({ ...base, notasPedido: updated }, {
          entityType: "nota_pedido",
          entityId: reenviarNotaId,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: "Entrega reenviada",
        });
      }

      const notas = [...base.notasPedido, ...notasLocais];
      const lastId = notasLocais[notasLocais.length - 1]?.id;
      return addAuditEntry({ ...base, notasPedido: notas }, {
        entityType: "nota_pedido",
        entityId: lastId ?? "",
        action: "criar",
        userId: user.id,
        userName: user.name,
        changes: `${qtdFotos} entrega(s) com foto`,
      });
    };

    let saved = updateDataSafe(persistir);

    if (!saved.ok) {
      saved = updateDataSafe((d) => {
        const base = compactarFotosNoArmazenamento({
          ...d,
          notasPedido: d.notasPedido.map((n) => ({ ...n, fotoPedido: undefined })),
        });
        return persistir(base);
      });
    }

    if (!saved.ok) {
      setEnviando(false);
      setErroEnvio(saved.error);
      return;
    }

    setEnviando(false);
    setAnexarModal(false);
    setFotosSessao([]);
    setSuccessMsg(
      qtdFotos === 1
        ? "Enviado! O responsável já pode conferir e lançar na sua ficha."
        : `${qtdFotos} fotos enviadas! O responsável vê na fila Conferir entregas.`
    );
  };

  const openConferir = async (nota: NotaPedido) => {
    let notaComFoto = nota;
    if (!nota.fotoPedido && data && coopId) {
      notaComFoto = await ensureNotaComFoto(data, nota, coopId);
    }
    setSelectedNota(notaComFoto);
    const instId = coopId
      ? resolverInstituicaoConferencia(coopId, instituicoes, nota.instituicaoId)
      : nota.instituicaoId;
    setConferenciaInstId(instId);
    setConferenciaDescontoPct(data?.config.descontoPadraoCooperativa ?? 5);
    const coopDonoId =
      data && coopId
        ? agruparPendentesPorCooperado(data, [nota], coopId)[0]?.cooperadoId ?? nota.cooperadoId
        : nota.cooperadoId;
    setConferenciaCooperadoId(coopDonoId);
    setAlterarInstConferencia(false);
    setConferenciaAssinatura(nota.assinaturaRecebedor ?? "");
    setConferirErrors({});
    if (!isCooperado && data) {
      const chave = getChaveGrupoConferencia(nota, data);
      const grupo = agruparPendentesPorCooperado(data, [nota], coopId)[0];
      setAbaConferenciaKey(chave);
      if (grupo?.cooperadoId) setFiltroCooperadoId(grupo.cooperadoId);
    }
    setConferirModal(true);
  };

  const listarPendentesConferencia = (
    d: AppData,
    coopIdLocal: string,
    chaveGrupo?: string,
    excludeId?: string
  ) =>
    d.notasPedido
      .filter((n) => {
        if (n.status !== "aguardando_conferencia") return false;
        if (excludeId && n.id === excludeId) return false;
        if (!notaPertenceCooperativa(d, n, coopIdLocal)) return false;
        if (chaveGrupo && getChaveGrupoConferencia(n, d) !== chaveGrupo) return false;
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const contarPendentesConferencia = (d: AppData, coopIdLocal: string) =>
    listarPendentesConferencia(d, coopIdLocal).length;

  const continuarFilaConferencia = (chaveGrupo: string, notaConcluidaId: string) => {
    if (!coopId) return;
    const d = getData();
    if (!d) return;

    const mesmaAba = listarPendentesConferencia(d, coopId, chaveGrupo, notaConcluidaId);
    if (mesmaAba.length > 0) {
      void openConferir(mesmaAba[0]);
      return;
    }

    const outras = listarPendentesConferencia(d, coopId, undefined, notaConcluidaId);
    if (outras.length > 0) {
      const proximoGrupo = agruparPendentesPorCooperado(d, outras, coopId)[0];
      if (proximoGrupo) selecionarAbaConferencia(proximoGrupo);
      void openConferir(outras[0]);
    }
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
    if (!conferenciaCooperadoId) errors.itens = "Escolha o cooperado dono desta nota.";
    if (!conferenciaAssinatura.trim()) errors.assinatura = "Informe quem assinou na escola.";
    if (conferenciaTotais.liquido <= 0) errors.itens = errors.itens ?? "Informe a quantidade de pelo menos um produto.";
    if (Object.keys(errors).length) {
      setConferirErrors(errors);
      return;
    }

    let notaAtualizada: NotaPedido | null = null;

    updateData((d) => {
      const now = new Date().toISOString();
      if (coopId && conferenciaInstId) setInstituicaoPadraoId(coopId, conferenciaInstId);
      const base = aplicarItensNaNota(
        {
          ...selectedNota,
          cooperadoId: conferenciaCooperadoId,
          instituicaoId: conferenciaInstId,
          localEntrega: conferenciaLocal,
          assinaturaRecebedor: conferenciaAssinatura,
          dataAssinatura: now.split("T")[0],
        },
        conferenciaItens.map((i) => ({ ...i, valorBruto: 0 })),
        conferenciaDescontoPct
      );
      notaAtualizada = {
        ...base,
        status: "conferida",
        conferidaPor: user.name,
        dataConferencia: now.split("T")[0],
      };
      const ficha = buildFichaFromNota(notaAtualizada, d, user.name);
      const arquivosMensais = upsertArquivoMensal(d, notaAtualizada.cooperadoId, notaAtualizada.cooperativaId, notaAtualizada.mesReferencia, {
        notaPedidoIds: [notaAtualizada.id],
      });
      return addAuditEntry(
        {
          ...d,
          notasPedido: d.notasPedido.map((n) => (n.id === selectedNota.id ? notaAtualizada! : n)),
          fichaCorrida: [...d.fichaCorrida, ficha],
          arquivosMensais,
        },
        { entityType: "nota_pedido", entityId: selectedNota.id, action: "aprovar", userId: user.id, userName: user.name }
      );
    });

    if (notaAtualizada && coopId) {
      const cnpj = getCooperativaCnpj(data, coopId);
      if (cnpj) void patchNotaPedidoInCloud(cnpj, notaAtualizada);
    }

    const notaId = selectedNota.id;
    const chaveAtual = getChaveGrupoConferencia(selectedNota, data);
    const coopNome = getCooperadoNome(data.cooperados, conferenciaCooperadoId);
    const pendentesRestantes = coopId ? contarPendentesConferencia(getData(), coopId) : 0;

    setConferirModal(false);
    setSelectedNota(null);
    setLancadoMsg(
      pendentesRestantes > 0
        ? `Nota aprovada! ${formatCurrency(conferenciaTotais.liquido)} na ficha de ${coopNome.split(" ")[0]}. Faltam ${pendentesRestantes} na fila.`
        : `Nota aprovada! ${formatCurrency(conferenciaTotais.liquido)} na ficha de ${coopNome.split(" ")[0]}. Fila concluída!`
    );
    setTimeout(() => setLancadoMsg(""), 6000);
    continuarFilaConferencia(chaveAtual, notaId);
  };

  const handleRejeitarNota = () => {
    if (!user || !data || !selectedNota || !motivoRejeicao.trim()) return;
    const now = new Date().toISOString();
    let notaAtualizada: NotaPedido | null = null;

    updateData((d) => {
      notaAtualizada = {
        ...selectedNota,
        status: "rejeitada",
        rejeitadaPor: user.name,
        dataRejeicao: now.split("T")[0],
        motivoRejeicao: motivoRejeicao.trim(),
        updatedAt: now,
      };
      return addAuditEntry(
        { ...d, notasPedido: d.notasPedido.map((n) => (n.id === selectedNota.id ? notaAtualizada! : n)) },
        { entityType: "nota_pedido", entityId: selectedNota.id, action: "editar", userId: user.id, userName: user.name }
      );
    });

    if (notaAtualizada && coopId && data) {
      const cnpj = getCooperativaCnpj(data, coopId);
      if (cnpj) void patchNotaPedidoInCloud(cnpj, notaAtualizada);
    }

    const notaId = selectedNota.id;
    const chaveAtual = getChaveGrupoConferencia(selectedNota, data);
    const pendentesRestantes = coopId ? contarPendentesConferencia(getData(), coopId) : 0;

    setRejectModal(false);
    setConferirModal(false);
    setSelectedNota(null);
    setMotivoRejeicao("");
    setLancadoMsg(
      pendentesRestantes > 0
        ? `Correção enviada ao cooperado. Faltam ${pendentesRestantes} na fila.`
        : "Correção enviada ao cooperado. Fila concluída!"
    );
    setTimeout(() => setLancadoMsg(""), 5000);
    continuarFilaConferencia(chaveAtual, notaId);
  };

  const handleExcluirPendente = async () => {
    if (!excluirNotaTarget || !user || !data || !coopId) return;
    if (excluirNotaTarget.cooperadoId !== (cooperadoId ?? user.cooperadoId)) return;
    if (excluirNotaTarget.status !== "aguardando_conferencia") return;

    setExcluindo(true);
    const cnpj = await resolveCooperativaCnpj(data, coopId, user);
    if (cnpj) {
      const del = await deleteNotaPedidoFromCloud(cnpj, excluirNotaTarget.id);
      if (!del.ok) {
        setExcluindo(false);
        setErroEnvio(del.error ?? "Não foi possível excluir na nuvem.");
        setExcluirNotaTarget(null);
        return;
      }
    }

    updateData((d) =>
      addAuditEntry(
        { ...d, notasPedido: d.notasPedido.filter((n) => n.id !== excluirNotaTarget.id) },
        {
          entityType: "nota_pedido",
          entityId: excluirNotaTarget.id,
          action: "excluir",
          userId: user.id,
          userName: user.name,
          changes: "Entrega pendente excluída pelo cooperado",
        }
      )
    );

    setExcluindo(false);
    setExcluirNotaTarget(null);
    setViewModal(false);
    setSuccessMsg("Entrega excluída. O responsável não verá mais esta foto.");
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
        onClick={() => (isCooperado ? openView(n) : n.status === "aguardando_conferencia" ? void openConferir(n) : openView(n))}
        className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-green-300 transition-colors"
      >
        <div className="flex gap-3">
          {getFotoExibicaoNota(n) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getFotoExibicaoNota(n)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
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
        {isCooperado && n.status === "aguardando_conferencia" && (
          <Button
            size="sm"
            className="w-full mt-3"
            variant="danger"
            onClick={(e) => { e.stopPropagation(); setExcluirNotaTarget(n); }}
          >
            <Trash2 size={16} /> Excluir pendente
          </Button>
        )}
      </button>
    );
  };

  return (
    <div className="relative pb-20 sm:pb-0">
      <PageHeader
        title={isCooperado ? "Minhas entregas" : "Conferir entregas"}
        subtitle={isCooperado ? "Envie uma foto para cada entrega na escola" : "Analise fotos, lance produtos ou registre entregas avulsas sem nota"}
        action={isCooperado ? (
          <div className="hidden sm:block">
            <Button size="lg" onClick={() => openAnexar()}>
              <Camera size={18} /> Enviar foto
            </Button>
          </div>
        ) : check("notas_pedido", "create") ? (
          <Button size="lg" onClick={() => openLancarAvulso()}>
            <UserPlus size={18} /> Lançar entrega
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

      {!isCooperado && pendentesTodas.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Fila para conferir ({pendentesTodas.length})</h2>
              <p className="text-xs text-gray-500 mt-0.5">Selecione o cooperado na aba — cada um vê só as próprias fotos.</p>
            </div>
            {grupoAbaAtiva && (
              <p className="text-xs font-medium text-amber-800">
                {pendentesAbaAtiva.length} foto(s) de {grupoAbaAtiva.nome}
              </p>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Cooperados com entregas pendentes"
            className="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-gray-200 -mx-1 px-1"
          >
            {pendentesPorCooperado.map((grupo) => (
              <button
                key={grupo.chave}
                type="button"
                role="tab"
                aria-selected={abaConferenciaKey === grupo.chave}
                onClick={() => selecionarAbaConferencia(grupo)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-semibold border border-b-0 transition-colors",
                  abaConferenciaKey === grupo.chave
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-amber-50 hover:border-amber-300"
                )}
              >
                {grupo.nome}
                <span
                  className={cn(
                    "min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold inline-flex items-center justify-center",
                    abaConferenciaKey === grupo.chave ? "bg-white/25 text-white" : "bg-amber-100 text-amber-800"
                  )}
                >
                  {grupo.notas.length}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendentesAbaAtiva.map((n) => (
              <button key={n.id} type="button" onClick={() => openConferir(n)} className="text-left border-2 border-amber-300 bg-amber-50 rounded-xl overflow-hidden hover:border-amber-500">
                {getFotoExibicaoNota(n) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getFotoExibicaoNota(n)} alt="" className="w-full h-36 object-cover" />
                )}
                <div className="p-3">
                  <p className="font-medium text-sm">{formatDate(n.dataEntrega)} · {n.numeroNota}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{getEscolaNotaLabel(n, data.instituicoes)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isCooperado && (
        <p className="text-sm text-gray-600 mb-4">
          Entregas de {formatMesReferencia(mesAtual)} — tire uma foto por pedido. Imagens repetidas são rejeitadas.{" "}
          <Link href="/ficha-corrida" className="text-green-700 font-medium">Quanto vou receber</Link>.
        </p>
      )}

      <FilterBar>
        {!isCooperado && cooperadosCoop.length > 0 && pendentesTodas.length === 0 && (
          <FormField label="Cooperado">
            <Select value={filtroCooperadoId} onChange={(e) => setFiltroCooperadoId(e.target.value)} className="min-w-[200px]">
              <option value="">Todos</option>
              {cooperadosCoop.map((c) => (
                <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
              ))}
            </Select>
          </FormField>
        )}
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
        onView={isCooperado ? openView : (n) => (n.status === "aguardando_conferencia" ? void openConferir(n) : openView(n))}
        viewLabel={isCooperado ? "Ver" : "Conferir"}
      />

      {isCooperado && (
        <div className="fixed bottom-20 right-4 z-30 sm:hidden">
          <Button size="lg" className="shadow-lg rounded-full px-5" onClick={() => openAnexar()}>
            <Camera size={20} /> Enviar foto
          </Button>
        </div>
      )}

      <Modal open={anexarModal} onClose={() => { if (enviando) return; setAnexarModal(false); setFotosSessao([]); setFotoDuplicadaMsg(""); setErroEnvio(""); }} title={reenviarNotaId ? "Enviar de novo" : "Enviar foto da entrega"} size="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button type="button" variant="secondary" disabled={enviando} onClick={() => setAnexarModal(false)}>Cancelar</Button>
            <Button type="button" size="lg" onClick={() => void handleAnexarEntrega()} disabled={fotosSessao.length === 0 || enviando || processandoFoto}>
              <FileText size={18} /> {enviando ? "Enviando..." : fotosSessao.length > 0 ? `Enviar ${fotosSessao.length} foto(s)` : "Enviar para a cooperativa"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {erroEnvio && (
            <AlertBanner variant="error" onDismiss={() => setErroEnvio("")}>
              {erroEnvio}
            </AlertBanner>
          )}
          <p className="text-sm text-gray-600">
            {reenviarNotaId
              ? "Tire uma nova foto do pedido corrigido."
              : "Tire uma foto de cada pedido. Cada foto vira uma entrega separada para a cooperativa analisar."}
          </p>

          {!reenviarNotaId && (
            <div className="rounded-xl border border-green-200 bg-green-50/60 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-green-900 flex items-center gap-2">
                  <ImagePlus size={18} />
                  {fotosSessao.length === 0
                    ? "Nenhuma imagem ainda"
                    : `${fotosSessao.length} ${fotosSessao.length === 1 ? "imagem adicionada" : "imagens adicionadas"}`}
                </span>
                {fotosSessao.length > 0 && (
                  <span className="text-xs font-bold text-green-800 bg-green-200 px-2 py-0.5 rounded-full">
                    +{fotosSessao.length}
                  </span>
                )}
              </div>
              <div className="h-3 bg-green-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(fotosSessao.length * 12, fotosSessao.length > 0 ? 12 : 0))}%` }}
                />
              </div>
              <p className="text-xs text-green-800 mt-2">
                {fotosSessao.length === 0
                  ? "O indicador cresce a cada foto nova."
                  : "Continue tirando fotos ou toque em Enviar quando terminar."}
              </p>
            </div>
          )}

          {fotoDuplicadaMsg && (
            <AlertBanner variant="error" onDismiss={() => setFotoDuplicadaMsg("")}>
              {fotoDuplicadaMsg}
            </AlertBanner>
          )}

          <FormField label="Contrato" hint="A entrega será conferida e lançada neste contrato.">
            {contratosEntrega.length <= 1 ? (
              <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex items-start gap-3">
                <FileSignature size={22} className="text-green-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900">
                    {contratosEntrega[0] ? getContratoLabel(contratosEntrega[0]) : "PNAE - MERENDA ESCOLAR"}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Contrato padrão — o responsável pode cadastrar outros em Contratos.
                  </p>
                </div>
              </div>
            ) : (
              <Select
                value={contratoInstId}
                onChange={(e) => setContratoInstId(e.target.value)}
              >
                {contratosEntrega.map((c) => (
                  <option key={c.id} value={c.id}>{getContratoLabel(c)}</option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField label={reenviarNotaId ? "Nova foto" : "Adicionar foto do pedido"} required error={formErrors.foto} hint="Mostre o pedido inteiro com a assinatura de quem recebeu.">
            <label className={`flex flex-col items-center gap-2 p-8 border-2 border-dashed border-green-400 rounded-2xl bg-green-50/50 ${processandoFoto || enviando ? "opacity-60 pointer-events-none" : "cursor-pointer active:bg-green-100"}`}>
              <Camera size={48} className="text-green-700" />
              <span className="text-base font-semibold text-green-800">
                {processandoFoto ? "Processando foto..." : fotosSessao.length === 0 ? "Tirar foto agora" : "Tirar outra foto"}
              </span>
              <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handleFoto(e)} disabled={processandoFoto || enviando} />
            </label>
          </FormField>

          {fotosSessao.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fotosSessao.map((foto, idx) => (
                <div key={idx} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt={`Foto ${idx + 1}`} className="w-full h-24 object-cover rounded-lg border-2 border-green-200" />
                  <span className="absolute top-1 left-1 bg-green-700 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerFotoSessao(idx)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-90 hover:opacity-100"
                    aria-label="Remover foto"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
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

          <FormField label="Cooperado" required error={avulsoErrors.cooperado} hint="Entrega vai para a ficha deste cooperado">
            <Select
              value={avulsoCooperadoId}
              onChange={(e) => {
                setAvulsoCooperadoId(e.target.value);
                setAvulsoErrors((p) => ({ ...p, cooperado: undefined }));
              }}
            >
              {cooperadosCoop.map((c) => (
                <option key={c.id} value={c.id}>{c.nomeCompleto}{c.avulso ? " (avulso)" : ""}</option>
              ))}
              <option value={NOVO_AVULSO}>+ Cadastrar nome avulso...</option>
            </Select>
            {avulsoCooperadoId === NOVO_AVULSO && (
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
            <Button size="lg" onClick={handleLancarNota}><CheckCircle size={18} /> Aprovar e lançar na ficha</Button>
          </div>
        ) : undefined}
      >
        {selectedNota && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase">Foto do pedido</p>
              {selectedNota.fotoPedido ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedNota.fotoPedido} alt="Pedido" className="w-full max-h-[55vh] object-contain rounded-xl border bg-gray-50 sticky top-0" />
              ) : selectedNota.fotoNaNuvem ? (
                <p className="text-gray-500 text-center py-12 border rounded-xl">Carregando foto da nuvem...</p>
              ) : (
                <p className="text-gray-500 text-center py-12 border rounded-xl">Sem foto</p>
              )}
              <p className="text-sm">
                <strong>{getCooperadoNome(data.cooperados, selectedNota.cooperadoId)}</strong> · {formatDate(selectedNota.dataEntrega)}
              </p>
              <p className="text-sm text-gray-600">Escola: {getEscolaNotaLabel(selectedNota, data.instituicoes)}</p>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Lançamento na ficha</p>
          <FormField label="Cooperado dono desta nota" required hint="Todos os cooperados cadastrados no CNPJ da cooperativa">
                <Select value={conferenciaCooperadoId} onChange={(e) => setConferenciaCooperadoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {cooperadosCoop.map((c) => (
                    <option key={c.id} value={c.id}>{c.nomeCompleto}{c.avulso ? " (avulso)" : ""}</option>
                  ))}
                </Select>
                {cooperadosCoop.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">Carregando cooperados da nuvem…</p>
                )}
              </FormField>

              <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Instituição</p>
                    {!alterarInstConferencia ? (
                      <>
                        <p className="font-semibold text-gray-900 mt-1">{conferenciaInstNome || "—"}</p>
                        <p className="text-xs text-gray-500 mt-1">Itens e preços do contrato</p>
                      </>
                    ) : (
                      <div className="mt-2">
                        <FormField label="Escolher outra instituição">
                          <Select value={conferenciaInstId} onChange={(e) => handleConferenciaInstChange(e.target.value)}>
                            {instituicoes.map((i) => (
                              <option key={i.id} value={i.id}>{i.nome}</option>
                            ))}
                          </Select>
                        </FormField>
                      </div>
                    )}
                  </div>
                  {!alterarInstConferencia && instituicoes.length > 1 && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setAlterarInstConferencia(true)}>
                      <Pencil size={14} /> Trocar
                    </Button>
                  )}
                </div>
              </div>

              <FormField label="Desconto cooperativa (%)" hint="Percentual descontado da cooperativa nesta entrega">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={conferenciaDescontoPct}
                  onChange={(e) => setConferenciaDescontoPct(parseFloat(e.target.value) || 0)}
                  className="max-w-[120px]"
                />
              </FormField>

              <FormField label="Quem assinou na escola?" required error={conferirErrors.assinatura}>
                <Input value={conferenciaAssinatura} onChange={(e) => setConferenciaAssinatura(e.target.value)} placeholder="Nome de quem recebeu" />
              </FormField>

              {conferenciaItens.length === 0 ? (
                <AlertBanner variant="warning">
                  Esta instituição ainda não tem produtos.{" "}
                  <Link href="/contratos" className="font-semibold underline">Cadastrar em Contratos</Link>
                </AlertBanner>
              ) : (
                <>
                  {conferirErrors.itens && <p className="text-sm text-red-600">{conferirErrors.itens}</p>}
                  <p className="text-sm text-gray-600">Quantidades entregues:</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {conferenciaItens.map((item, idx) => (
                      <div key={item.produtoInstituicaoId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.produtoNome}</p>
                          <p className="text-xs text-gray-500">{formatCurrency(item.precoUnitario)} / {labelUnidade(item.unidade)}</p>
                        </div>
                        <Input type="number" min={0} step="0.01" className="w-24 text-center" value={item.quantidade || ""} onChange={(e) => updateConferenciaQty(idx, parseFloat(e.target.value) || 0)} />
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>Bruto</span><span>{formatCurrency(conferenciaTotais.bruto)}</span></div>
                    <div className="flex justify-between text-amber-700"><span>Desconto ({conferenciaDescontoPct}%)</span><span>- {formatCurrency(conferenciaTotais.desconto)}</span></div>
                    <div className="flex justify-between font-bold text-green-700 text-base pt-1 border-t"><span>Total a receber</span><span>{formatCurrency(conferenciaTotais.liquido)}</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
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
            {(selectedNota.fotoPedido || getFotoExibicaoNota(selectedNota)) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedNota.fotoPedido ?? getFotoExibicaoNota(selectedNota)} alt="Pedido" className="w-full rounded-xl border" />
            )}
            {selectedNota.status === "rejeitada" && (
              <Button className="w-full" onClick={() => { setViewModal(false); openAnexar(selectedNota); }}>
                <RefreshCw size={18} /> Enviar de novo
              </Button>
            )}
            {isCooperado && selectedNota.status === "aguardando_conferencia" && (
              <Button className="w-full" variant="danger" onClick={() => setExcluirNotaTarget(selectedNota)}>
                <Trash2 size={18} /> Excluir entrega pendente
              </Button>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(excluirNotaTarget)}
        onClose={() => !excluindo && setExcluirNotaTarget(null)}
        title="Excluir entrega pendente?"
        message="A foto será removida da sua lista e também desaparece para o responsável. Esta ação não pode ser desfeita."
        confirmLabel="Sim, excluir"
        variant="danger"
        loading={excluindo}
        onConfirm={() => void handleExcluirPendente()}
      />
    </div>
  );
}
