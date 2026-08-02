"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Camera, CheckCircle, FileText, XCircle, RefreshCw, ChevronRight, Eye, Building2, Pencil, UserPlus, X, ImagePlus, Trash2, FileSignature, BookOpen, Package,
} from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField, Textarea } from "@/components/ui/Form";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { NotaStatusTimeline } from "@/components/notas/NotaStatusTimeline";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PromptDialog, ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { NotaFotoImg } from "@/components/ui/NotaFotoImg";
import { updateData, updateDataSafe, generateId, addAuditEntry, getData } from "@/services/dataStore";
import { requestAppSync } from "@/services/syncRequest";
import { forceNextFullNotasSync } from "@/services/syncMetaService";
import {
  calcularItensNota,
  gerarNumeroNota,
  buildFichaFromNota,
  aplicarItensNaNota,
  upsertArquivoMensal,
  consolidarItensLancamentoPorFoto,
} from "@/services/notaPedidoService";
import {
  getCooperativaCnpj,
  patchNotaPedidoInCloud,
  pushNotasPedidoToCloud,
  syncOfflineDeliveryImages,
  finalizeNotaEntregaNaNuvem,
  deleteFotoRascunhoFromCloud,
  deleteNotaPedidoFromCloud,
  queueNotaDelete,
  ensureNotaComFoto,
  resolveCooperativaCnpj,
  fetchNotaFotoPartBlobUrl,
} from "@/services/notaPedidoCloudService";
import {
  processDeliveryImage,
  uploadImageToSupabase,
  validateImageFile,
  revokePreviewUrl,
  userFacingPipelineError,
  slimNotaDraftForUpload,
  type ImagePipelineStep,
} from "@/services/imagePipelineService";
import {
  enqueuePendingDeliveryImage,
  buildPendingImageId,
} from "@/services/offlineImageQueueService";
import { putLocalNotaMedia } from "@/services/localMediaStore";
import { listCooperadosDaCooperativa, pushCooperadoToCloud, resolverCooperadoIdCanonico, getCooperadoNomeResolvido, notaPertenceCooperado } from "@/services/cooperadoCloudService";
import { pushOperacionalToCloud, syncContratosFromCloud } from "@/services/cooperativaSyncCloudService";
import { getProdutosContrato } from "@/services/catalogoContratosService";
import { listarResumosMensaisEntregas, filtrarResumosEntregasPendentes } from "@/services/cooperadoEntregasService";
import { CooperadoEntregasPorMes } from "@/components/cooperado/CooperadoEntregasPorMes";
import { CooperadoMinhaFichaTab } from "@/components/cooperado/CooperadoMinhaFichaTab";
import { getContratoLabel, getContratosEntrega, resolverContratoEntrega } from "@/utils/contratosEntrega";
import { cn, formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import {
  getInstituicaoPadraoId,
  setInstituicaoPadraoId,
  clearInstituicaoPadraoId,
  resolverInstituicaoConferencia,
} from "@/utils/instituicaoPreferida";
import { getCooperadoNome } from "@/utils/calculations";
import {
  fingerprintFotoFile,
  getFotoExibicaoNota,
  getFotosExibicaoNota,
  notaPertenceCooperativa,
  compactarFotosNoArmazenamento,
  liberarEspacoArmazenamento,
  agruparPendentesPorCooperado,
  getChaveGrupoConferencia,
  notaPertenceGrupoConferencia,
  contarFotosEnviadasNota,
  contarFotosEnviadasNotas,
  resolverAbaConferenciaAtiva,
  MAX_FOTOS_POR_SESSAO_ENTREGA,
  AVISO_FOTOS_SESSAO_EM,
  fotosSessaoAtingiuLimite,
  fotosRestantesNaSessao,
  mensagemLimiteFotosSessao,
} from "@/utils/fotoEntrega";
import {
  loadFotoDraftMeta,
  clearFotoDraft,
  appendFotoDraftMeta,
  countFotoDraft,
  countFotosUploadedDraft,
  isFotoDraftDuplicadaByFingerprint,
  getOrCreatePendingNotaId,
  removeFotoDraftAt,
  markFotoDraftUploaded,
  saveDraftNotaIdentity,
  getDraftNotaIdentity,
} from "@/utils/fotoDraftStore";
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
  cooperativaId?: string,
  existing?: NotaPedidoItem[]
): ItemForm[] {
  return getProdutosContrato(data, instituicaoId, cooperativaId).map((p) => {
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

function qtyInputClassName(filled: boolean, extra?: string) {
  return cn(
    "min-h-[3.25rem] px-3 py-2 text-center text-2xl font-bold tabular-nums rounded-xl border-2 shadow-sm transition-colors",
    "focus:outline-none focus:ring-4",
    filled
      ? "bg-green-50 border-green-500 text-green-900 placeholder:text-green-400 focus:border-green-600 focus:ring-green-200/80"
      : "bg-amber-50 border-amber-500 text-gray-900 placeholder:text-amber-600 focus:border-amber-600 focus:ring-amber-200/80",
    extra
  );
}

export default function NotasPedidoContent() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState(isCooperado ? "pendentes" : "");
  const filtroResponsavelIniciado = useRef(false);
  const [anexarModal, setAnexarModal] = useState(false);
  const [conferirModal, setConferirModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [lancadoMsg, setLancadoMsg] = useState("");

  const [formErrors, setFormErrors] = useState<{ foto?: string; escolaAvulsa?: string; contrato?: string }>({});
  const [usarEscolaAvulsa, setUsarEscolaAvulsa] = useState(false);
  const [escolaAvulsaNome, setEscolaAvulsaNome] = useState("");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [fotosSessaoCount, setFotosSessaoCount] = useState(0);
  const [fotosConfirmadasNaSessao, setFotosConfirmadasNaSessao] = useState(0);
  const [fotosNaNuvemCount, setFotosNaNuvemCount] = useState(0);
  const [fotoAtualPreview, setFotoAtualPreview] = useState<string | null>(null);
  const [envioProgresso, setEnvioProgresso] = useState<{ sent: number; total: number } | null>(null);
  const [fotoDuplicadaMsg, setFotoDuplicadaMsg] = useState("");
  const [fotoPipelineStep, setFotoPipelineStep] = useState<ImagePipelineStep | "idle">("idle");
  const [fotoValidationWarning, setFotoValidationWarning] = useState("");
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [reenviarNotaId, setReenviarNotaId] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const fotoPreviewUrlRef = useRef<string | null>(null);

  const [selectedNota, setSelectedNota] = useState<NotaPedido | null>(null);
  const [conferenciaItens, setConferenciaItens] = useState<ItemForm[]>([]);
  const [conferenciaCooperadoId, setConferenciaCooperadoId] = useState("");
  const [conferenciaDescontoPct, setConferenciaDescontoPct] = useState(5);
  const [conferenciaInstId, setConferenciaInstId] = useState("");
  const [conferenciaLocal, setConferenciaLocal] = useState("");
  const [conferenciaEscolaAvulsa, setConferenciaEscolaAvulsa] = useState("");
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [conferirErrors, setConferirErrors] = useState<{ itens?: string }>({});
  const [instituicaoPadraoId, setInstituicaoPadraoIdState] = useState("");
  const [alterarInstConferencia, setAlterarInstConferencia] = useState(false);

  const [avulsoModal, setAvulsoModal] = useState(false);
  const [avulsoCooperadoId, setAvulsoCooperadoId] = useState("");
  const [avulsoNovoNome, setAvulsoNovoNome] = useState("");
  const [avulsoInstId, setAvulsoInstId] = useState("");
  const [avulsoDataEntrega, setAvulsoDataEntrega] = useState("");
  const [avulsoAssinatura, setAvulsoAssinatura] = useState("");
  const [avulsoItens, setAvulsoItens] = useState<ItemForm[]>([]);
  const avulsoInstIdAnteriorRef = useRef("");
  const [avulsoErrors, setAvulsoErrors] = useState<{ cooperado?: string; instituicao?: string; assinatura?: string; itens?: string }>({});

  const [filtroCooperadoId, setFiltroCooperadoId] = useState("");
  const [abaConferenciaKey, setAbaConferenciaKey] = useState("");
  const [abaCooperado, setAbaCooperado] = useState<"entregas" | "ficha">("entregas");
  const [contratoInstId, setContratoInstId] = useState("");
  const [anexarSucesso, setAnexarSucesso] = useState(false);
  const [ultimaNotaEnviadaIds, setUltimaNotaEnviadaIds] = useState<string[]>([]);
  const [excluirNotaTarget, setExcluirNotaTarget] = useState<NotaPedido | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [rascunhoFotosCount, setRascunhoFotosCount] = useState(0);
  const [rascunhoContratoId, setRascunhoContratoId] = useState("");

  const anexarParamHandledRef = useRef(false);
  const fotoProcessandoRef = useRef(false);
  const fotoAbortRef = useRef<AbortController | null>(null);
  const uploadFilaRef = useRef(Promise.resolve());
  const lastFotoFileRef = useRef<File | null>(null);
  const lancandoRef = useRef(false);
  const filaConferenciaRef = useRef<{ total: number; concluidas: number; chave: string } | null>(null);
  const [filaConferenciaPos, setFilaConferenciaPos] = useState(0);
  const [filaConferenciaTotal, setFilaConferenciaTotal] = useState(0);
  const [conferenciaTransicao, setConferenciaTransicao] = useState(false);
  const [conferenciaFotoErro, setConferenciaFotoErro] = useState("");
  const [conferenciaFotoIdx, setConferenciaFotoIdx] = useState(0);
  const [lancamentoSequencia, setLancamentoSequencia] = useState<{
    url: string;
    displayIdx: number;
    total: number;
  } | null>(null);
  const lancamentoSequenciaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conferenciaFotoCacheRef = useRef<Map<number, string>>(new Map());
  const fotosLancadasConferenciaRef = useRef<Set<number>>(new Set());
  const lancamentosFotoConferenciaRef = useRef<Map<number, NotaPedidoItem[]>>(new Map());
  const [conferenciaFotoAtualUrl, setConferenciaFotoAtualUrl] = useState<string | null>(null);
  const [conferenciaFotoCarregando, setConferenciaFotoCarregando] = useState(false);
  const [conferenciaFotoSomenteLeitura, setConferenciaFotoSomenteLeitura] = useState(false);
  const [fotosLancadasUi, setFotosLancadasUi] = useState<Set<number>>(() => new Set());

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const ANEXAR_DRAFT_KEY = coopId ? `hb_anexar_draft_${coopId}` : "";

  const revokeFotoPreview = useCallback(() => {
    revokePreviewUrl(fotoPreviewUrlRef.current);
    fotoPreviewUrlRef.current = null;
    setFotoAtualPreview(null);
  }, []);

  const revokeConferenciaFotoCache = useCallback(() => {
    for (const url of conferenciaFotoCacheRef.current.values()) {
      revokePreviewUrl(url);
    }
    conferenciaFotoCacheRef.current.clear();
    setConferenciaFotoAtualUrl(null);
    setConferenciaFotoCarregando(false);
  }, []);

  const loadConferenciaFoto = useCallback(
    async (nota: NotaPedido, index: number): Promise<string | null> => {
      const cached = conferenciaFotoCacheRef.current.get(index);
      if (cached) {
        setConferenciaFotoAtualUrl(cached);
        return cached;
      }

      const localFotos = getFotosExibicaoNota(nota);
      if (localFotos[index]) {
        conferenciaFotoCacheRef.current.set(index, localFotos[index]);
        setConferenciaFotoAtualUrl(localFotos[index]);
        return localFotos[index];
      }

      if (!nota.fotoNaNuvem) return null;
      const cnpj =
        nota.cooperativaCnpj ??
        (data && coopId ? getCooperativaCnpj(data, coopId) : undefined) ??
        (user && coopId ? await resolveCooperativaCnpj(data ?? getData(), coopId, user) : undefined);
      if (!cnpj) return null;

      setConferenciaFotoCarregando(true);
      try {
        const url = await fetchNotaFotoPartBlobUrl(cnpj, nota.id, index);
        if (url) {
          conferenciaFotoCacheRef.current.set(index, url);
          setConferenciaFotoAtualUrl(url);
        }
        return url;
      } finally {
        setConferenciaFotoCarregando(false);
      }
    },
    [data, coopId, user]
  );

  const resetConferenciaPorFoto = useCallback(() => {
    fotosLancadasConferenciaRef.current = new Set();
    lancamentosFotoConferenciaRef.current = new Map();
    setConferenciaFotoSomenteLeitura(false);
    setFotosLancadasUi(new Set());
  }, []);

  const carregarItensParaFotoConferencia = useCallback(
    (fotoIdx: number) => {
      const d = getData() ?? data;
      if (!d || !conferenciaInstId) return;
      if (fotosLancadasConferenciaRef.current.has(fotoIdx)) {
        const salvos = lancamentosFotoConferenciaRef.current.get(fotoIdx);
        setConferenciaItens(loadItensFromInstituicao(d, conferenciaInstId, coopId, salvos));
        setConferenciaFotoSomenteLeitura(true);
        return;
      }
      setConferenciaItens(loadItensFromInstituicao(d, conferenciaInstId, coopId));
      setConferenciaFotoSomenteLeitura(false);
    },
    [data, conferenciaInstId, coopId]
  );

  const lancarFotoConferenciaAtual = useCallback(
    (fotoIdx: number, totalFotos: number): { ok: boolean; error?: string } => {
      if (!user || !selectedNota) return { ok: false, error: "Entrega não selecionada." };
      if (fotosLancadasConferenciaRef.current.has(fotoIdx)) return { ok: true };

      const r = calcularItensNota(
        conferenciaItens.map((i) => ({ ...i, valorBruto: 0 })),
        conferenciaDescontoPct
      );
      if (r.valorLiquido <= 0) {
        return { ok: false, error: "Informe a quantidade de pelo menos um produto nesta foto." };
      }

      const d0 = getData() ?? data;
      if (!d0) return { ok: false, error: "Dados indisponíveis." };

      const coopSel =
        coopId && d0
          ? listCooperadosDaCooperativa(d0, coopId).find((c) => c.id === conferenciaCooperadoId)
          : undefined;
      const nomeCoop =
        coopSel?.nomeCompleto?.trim() ||
        selectedNota.cooperadoNomeSnapshot?.trim() ||
        getCooperadoNomeResolvido(d0, conferenciaCooperadoId, coopId);

      updateData((d) => {
        const cooperadoIdCanonico = resolverCooperadoIdCanonico(
          d,
          conferenciaCooperadoId,
          coopId,
          nomeCoop
        );
        const base = aplicarItensNaNota(
          {
            ...selectedNota,
            cooperadoId: cooperadoIdCanonico,
            cooperadoNomeSnapshot: nomeCoop,
            instituicaoId: conferenciaInstId,
            localEntrega: conferenciaLocal,
            escolaAvulsaNome: conferenciaEscolaAvulsa.trim() || selectedNota.escolaAvulsaNome,
          },
          conferenciaItens.map((i) => ({ ...i, valorBruto: 0 })),
          conferenciaDescontoPct
        );
        const ficha = buildFichaFromNota(base, d, user.name, nomeCoop, {
          fotoIndex: fotoIdx,
          totalFotos,
        });
        lancamentosFotoConferenciaRef.current.set(fotoIdx, base.itens);
        fotosLancadasConferenciaRef.current.add(fotoIdx);
        setFotosLancadasUi(new Set(fotosLancadasConferenciaRef.current));

        const jaNaFicha = d.fichaCorrida.some(
          (f) => f.notaPedidoId === selectedNota.id && f.descricao.includes(`foto ${fotoIdx + 1}/`)
        );
        if (jaNaFicha) return d;

        const arquivosMensais = upsertArquivoMensal(d, base.cooperadoId, base.cooperativaId, base.mesReferencia, {
          notaPedidoIds: [selectedNota.id],
        });
        return addAuditEntry(
          {
            ...d,
            fichaCorrida: [...d.fichaCorrida, ficha],
            arquivosMensais,
          },
          {
            entityType: "nota_pedido",
            entityId: selectedNota.id,
            action: "aprovar",
            userId: user.id,
            userName: user.name,
            changes: `Foto ${fotoIdx + 1}/${totalFotos} lançada na ficha`,
          }
        );
      });

      return { ok: true };
    },
    [
      user,
      selectedNota,
      conferenciaItens,
      conferenciaDescontoPct,
      data,
      conferenciaCooperadoId,
      coopId,
      conferenciaInstId,
      conferenciaLocal,
      conferenciaEscolaAvulsa,
    ]
  );

  const irParaFotoConferencia = useCallback(
    (novoIdx: number) => {
      if (!selectedNota) return;
      const total = contarFotosEnviadasNota(selectedNota);
      if (total <= 1) {
        setConferenciaFotoIdx(Math.min(Math.max(0, novoIdx), total - 1));
        return;
      }

      const clamped = Math.min(Math.max(0, novoIdx), total - 1);
      const atual = conferenciaFotoIdx;

      if (clamped > atual && !fotosLancadasConferenciaRef.current.has(atual)) {
        const r = calcularItensNota(
          conferenciaItens.map((i) => ({ ...i, valorBruto: 0 })),
          conferenciaDescontoPct
        );
        if (r.valorLiquido > 0) {
          const lanc = lancarFotoConferenciaAtual(atual, total);
          if (!lanc.ok) {
            setConferirErrors({ itens: lanc.error });
            return;
          }
          setLancadoMsg(`Foto ${atual + 1} lançada na ficha. Preencha a foto ${clamped + 1}.`);
          setTimeout(() => setLancadoMsg(""), 3500);
        } else if (clamped > atual + 1) {
          setConferirErrors({
            itens: `Lance os itens da foto ${atual + 1} antes de pular para a foto ${clamped + 1}.`,
          });
          return;
        }
      }

      setConferirErrors({});
      setConferenciaFotoIdx(clamped);
      carregarItensParaFotoConferencia(clamped);
    },
    [
      selectedNota,
      conferenciaFotoIdx,
      conferenciaItens,
      conferenciaDescontoPct,
      lancarFotoConferenciaAtual,
      carregarItensParaFotoConferencia,
    ]
  );

  const resetFotosSessaoUi = useCallback(() => {
    fotoAbortRef.current?.abort();
    fotoAbortRef.current = null;
    revokeFotoPreview();
    setFotosSessaoCount(0);
    setFotosConfirmadasNaSessao(0);
    setFotosNaNuvemCount(0);
    setEnvioProgresso(null);
    setFotoPipelineStep("idle");
    setFotoValidationWarning("");
    lastFotoFileRef.current = null;
  }, [revokeFotoPreview]);

  const syncFotosSessaoFromDraft = useCallback(async () => {
    if (!ANEXAR_DRAFT_KEY) {
      resetFotosSessaoUi();
      return;
    }
    const meta = await loadFotoDraftMeta(ANEXAR_DRAFT_KEY);
    if (!meta?.count) {
      resetFotosSessaoUi();
      return;
    }
    setFotosSessaoCount(meta.count);
    setFotosNaNuvemCount(meta.uploadedCount ?? 0);
    setFotosConfirmadasNaSessao(meta.count);
  }, [ANEXAR_DRAFT_KEY, resetFotosSessaoUi]);

  const limparRascunhoAnexar = useCallback(() => {
    if (ANEXAR_DRAFT_KEY) void clearFotoDraft(ANEXAR_DRAFT_KEY);
    setRascunhoFotosCount(0);
    setRascunhoContratoId("");
    resetFotosSessaoUi();
  }, [ANEXAR_DRAFT_KEY, resetFotosSessaoUi]);

  const fecharAnexarModal = (force = false) => {
    if (!force && (enviando || processandoFoto)) return;

    if (force) {
      setAnexarModal(false);
      setAnexarSucesso(false);
      resetFotosSessaoUi();
      setFotoDuplicadaMsg("");
      setErroEnvio("");
      setFormErrors({});
      limparRascunhoAnexar();
      return;
    }

    if (fotosSessaoCount > 0 && !anexarSucesso) {
      setRascunhoFotosCount(fotosSessaoCount);
      if (contratoInstId) setRascunhoContratoId(contratoInstId);
    } else if (fotosSessaoCount === 0) {
      limparRascunhoAnexar();
    }

    setAnexarModal(false);
    setAnexarSucesso(false);
    resetFotosSessaoUi();
    setFotoDuplicadaMsg("");
    setErroEnvio("");
    setFormErrors({});
  };

  useEffect(() => {
    if (!conferirModal || !selectedNota) return;
    void loadConferenciaFoto(selectedNota, conferenciaFotoIdx);
  }, [conferirModal, selectedNota, conferenciaFotoIdx, loadConferenciaFoto]);

  useEffect(() => {
    if (!isCooperado) return;
    const flush = () => void syncOfflineDeliveryImages();
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [isCooperado]);

  useEffect(() => {
    if (!ANEXAR_DRAFT_KEY) return;
    void loadFotoDraftMeta(ANEXAR_DRAFT_KEY).then((meta) => {
      if (!meta?.count) return;
      setRascunhoFotosCount(meta.count);
      if (meta.contratoId) setRascunhoContratoId(meta.contratoId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ANEXAR_DRAFT_KEY]);

  const aplicarContratoLocal = useCallback(
    (currentData: NonNullable<ReturnType<typeof getData>>, notaRejeitada?: NotaPedido) => {
      if (!coopId) return;
      const resolved = resolverContratoEntrega(
        currentData,
        coopId,
        notaRejeitada?.instituicaoId,
        { criarPadraoSeVazio: !isCooperado }
      );
      if (resolved.criou) updateData(() => resolved.data);
      setContratoInstId(resolved.instituicaoId);
      if (resolved.instituicaoId) setInstituicaoPadraoId(coopId, resolved.instituicaoId);
    },
    [coopId, isCooperado]
  );

  const sincronizarContratosEmBackground = useCallback(
    async (notaRejeitada?: NotaPedido) => {
      if (!isCooperado || !user || !coopId) return;
      let currentData = getData();
      const cnpj = await resolveCooperativaCnpj(currentData, coopId, user);
      if (cnpj) {
        try {
          await syncContratosFromCloud(cnpj);
        } catch {
          /* offline — mantém contratos locais */
        }
      }
      currentData = getData();
      if (currentData) aplicarContratoLocal(currentData, notaRejeitada);
    },
    [aplicarContratoLocal, coopId, isCooperado, user]
  );

  const abrirCameraAnexar = useCallback(() => {
    if (processandoFoto || enviando) return;
    if (fotosSessaoAtingiuLimite(fotosSessaoCount)) return;
    fotoInputRef.current?.click();
  }, [enviando, fotosSessaoCount, processandoFoto]);

  const limiteFotosSessaoAtingido = fotosSessaoAtingiuLimite(fotosSessaoCount);
  const proximoDoLimiteFotos = fotosSessaoCount >= AVISO_FOTOS_SESSAO_EM && !limiteFotosSessaoAtingido;

  const continuarRascunhoFotos = (abrirCamera = false) => {
    if (rascunhoFotosCount === 0) return;
    setFormErrors({});
    setErroEnvio("");
    setAnexarSucesso(false);
    setReenviarNotaId(null);
    setFotoDuplicadaMsg("");
    if (rascunhoContratoId) {
      setContratoInstId(rascunhoContratoId);
      if (coopId) setInstituicaoPadraoId(coopId, rascunhoContratoId);
    }
    setRascunhoFotosCount(0);
    setAnexarModal(true);
    void (async () => {
      await syncFotosSessaoFromDraft();
      if (abrirCamera) {
        const count = await countFotoDraft(ANEXAR_DRAFT_KEY);
        if (!fotosSessaoAtingiuLimite(count)) abrirCameraAnexar();
      }
    })();
  };

  const openAnexar = (notaRejeitada?: NotaPedido, options?: { abrirCamera?: boolean }) => {
    if (!notaRejeitada && rascunhoFotosCount > 0) {
      continuarRascunhoFotos(options?.abrirCamera ?? false);
      return;
    }

    setFormErrors({});
    setErroEnvio("");
    setAnexarSucesso(false);
    setReenviarNotaId(notaRejeitada?.id ?? null);
    setInstituicaoId(notaRejeitada?.instituicaoId ?? "");
    setUsarEscolaAvulsa(Boolean(notaRejeitada?.escolaAvulsaNome?.trim()));
    setEscolaAvulsaNome(notaRejeitada?.escolaAvulsaNome ?? "");
    resetFotosSessaoUi();
    setFotoDuplicadaMsg("");
    setObservacoes(notaRejeitada?.observacoes ?? "");
    if (!notaRejeitada) {
      limparRascunhoAnexar();
    } else {
      void syncFotosSessaoFromDraft();
    }

    let currentData = data ?? getData();
    if (isCooperado && currentData) {
      const compactar = () => updateDataSafe((d) => compactarFotosNoArmazenamento(d));
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(compactar, { timeout: 2500 });
      } else {
        setTimeout(compactar, 0);
      }
      currentData = getData() ?? currentData;
    }

    if (currentData) aplicarContratoLocal(currentData, notaRejeitada);

    setAnexarModal(true);
    if (!notaRejeitada) {
      void syncFotosSessaoFromDraft();
    }
    void sincronizarContratosEmBackground(notaRejeitada);

    if (options?.abrirCamera) abrirCameraAnexar();
  };

  const cooperadosCoop = useMemo(() => {
    if (!data || !coopId) return [];
    return listCooperadosDaCooperativa(data, coopId);
  }, [data, coopId]);

  useEffect(() => {
    const cid = searchParams.get("cooperado");
    if (cid && !isCooperado) {
      setFiltroCooperadoId(cid);
    }
  }, [searchParams, isCooperado]);

  useEffect(() => {
    if (!isCooperado && !filtroResponsavelIniciado.current) {
      setStatusFilter("aguardando_conferencia");
      filtroResponsavelIniciado.current = true;
    }
  }, [isCooperado]);

  const resumosMensaisCooperado = useMemo(() => {
    if (!isCooperado || !data || !cooperadoId) return [];
    const base = listarResumosMensaisEntregas(data, cooperadoId, coopId);
    if (statusFilter === "pendentes") return filtrarResumosEntregasPendentes(base);
    if (!statusFilter) return base;
    return base
      .map((r) => ({
        ...r,
        notas: r.notas.filter((n) => n.status === statusFilter),
      }))
      .filter((r) => r.notas.length > 0);
  }, [data, cooperadoId, coopId, isCooperado, statusFilter]);

  const resumosFichaCooperado = useMemo(() => {
    if (!isCooperado || !data || !cooperadoId) return [];
    return listarResumosMensaisEntregas(data, cooperadoId, coopId);
  }, [data, cooperadoId, coopId, isCooperado]);

  const nomeCooperadoExibicao = useMemo(() => {
    if (!data || !cooperadoId) return user?.name ?? "Cooperado";
    return data.cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto ?? user?.name ?? "Cooperado";
  }, [data, cooperadoId, user?.name]);


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

  const { chave: abaConferenciaEfetiva, grupo: grupoAbaAtiva } = useMemo(
    () => resolverAbaConferenciaAtiva(pendentesPorCooperado, abaConferenciaKey, filtroCooperadoId),
    [pendentesPorCooperado, abaConferenciaKey, filtroCooperadoId]
  );

  const pendentesAbaAtiva = useMemo(
    () => grupoAbaAtiva?.notas ?? [],
    [grupoAbaAtiva]
  );

  const totalFotosPendentes = useMemo(
    () => contarFotosEnviadasNotas(pendentesTodas),
    [pendentesTodas]
  );

  const fotosAbaAtiva = useMemo(
    () => contarFotosEnviadasNotas(pendentesAbaAtiva),
    [pendentesAbaAtiva]
  );

  useEffect(() => {
    if (isCooperado || pendentesPorCooperado.length === 0) return;
    if (abaConferenciaEfetiva && abaConferenciaEfetiva !== abaConferenciaKey) {
      setAbaConferenciaKey(abaConferenciaEfetiva);
    }
    const cooperadoDaAba = grupoAbaAtiva?.cooperadoId;
    if (cooperadoDaAba && cooperadoDaAba !== filtroCooperadoId) {
      setFiltroCooperadoId(cooperadoDaAba);
    }
  }, [
    isCooperado,
    pendentesPorCooperado.length,
    abaConferenciaEfetiva,
    abaConferenciaKey,
    grupoAbaAtiva?.cooperadoId,
    filtroCooperadoId,
  ]);

  const selecionarAbaConferencia = (grupo: (typeof pendentesPorCooperado)[number]) => {
    setAbaConferenciaKey(grupo.chave);
    setFiltroCooperadoId(grupo.cooperadoId);
    if (statusFilter !== "aguardando_conferencia") {
      setStatusFilter("aguardando_conferencia");
    }
  };

  const notas = useMemo(() => {
    if (!data) return [];
    const filtrarPorGrupoAtivo =
      !isCooperado && pendentesTodas.length > 0 && Boolean(abaConferenciaEfetiva);

    return data.notasPedido
      .filter((n) => {
        if (coopId && !notaPertenceCooperativa(data, n, coopId)) return false;
        if (isCooperado && cooperadoId && n.cooperadoId !== cooperadoId) return false;

        if (filtrarPorGrupoAtivo) {
          if (!notaPertenceGrupoConferencia(n, data, abaConferenciaEfetiva, coopId)) return false;
        } else if (!isCooperado && filtroCooperadoId) {
          if (!notaPertenceCooperado(data, n, filtroCooperadoId, coopId)) return false;
        }

        if (statusFilter && n.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [
    data,
    coopId,
    isCooperado,
    cooperadoId,
    filtroCooperadoId,
    statusFilter,
    abaConferenciaEfetiva,
    pendentesTodas.length,
  ]);

  const contratosEntrega = useMemo(() => {
    if (!data || !coopId) return [];
    return getContratosEntrega(data, coopId);
  }, [data, coopId]);

  const instituicoes = contratosEntrega;

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

  useEffect(() => {
    if (!coopId || contratosEntrega.length === 0) return;
    const saved = getInstituicaoPadraoId(coopId);
    if (saved && !contratosEntrega.some((c) => c.id === saved)) {
      clearInstituicaoPadraoId(coopId);
      if (instituicaoPadraoId === saved) setInstituicaoPadraoIdState("");
      if (contratoInstId === saved) setContratoInstId("");
    }
  }, [coopId, contratosEntrega, instituicaoPadraoId, contratoInstId]);

  const contratoSelecionado = useMemo(() => {
    if (!data || !contratoInstId) return contratosEntrega[0];
    return contratosEntrega.find((c) => c.id === contratoInstId) ?? contratosEntrega[0];
  }, [data, contratoInstId, contratosEntrega]);

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
    if (data && instId) {
      const inst = data.instituicoes.find((i) => i.id === instId);
      setConferenciaLocal(inst?.localEntrega ?? inst?.endereco ?? "");
      setConferenciaItens(loadItensFromInstituicao(data, instId, coopId));
    }
  };

  useEffect(() => {
    if (!isCooperado || !data) return;
    requestAppSync();
  }, [isCooperado, data]);

  // Responsável: ao abrir Conferir entregas, força full sync uma vez (não depende só de delta).
  const responsavelFullSyncRef = useRef(false);
  useEffect(() => {
    if (isCooperado || !data || !coopId) return;
    if (responsavelFullSyncRef.current) return;
    responsavelFullSyncRef.current = true;
    const cnpj = getCooperativaCnpj(data, coopId);
    if (cnpj) forceNextFullNotasSync(cnpj);
    requestAppSync();
  }, [isCooperado, data, coopId]);

  useEffect(() => {
    if (searchParams.get("anexar") !== "1" || !isCooperado || !data || anexarParamHandledRef.current) return;
    anexarParamHandledRef.current = true;
    openAnexar(undefined, { abrirCamera: true });
    router.replace("/notas-pedido", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isCooperado, data]);

  useEffect(() => {
    if (!isCooperado || !user || !coopId || !data) return;
    void sincronizarContratosEmBackground();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCooperado, user?.id, coopId]);

  useEffect(() => {
    if (!anexarModal || !data || !coopId) return;
    const preferId =
      reenviarNotaId
        ? data.notasPedido.find((n) => n.id === reenviarNotaId)?.instituicaoId
        : contratoInstId || undefined;
    const resolved = resolverContratoEntrega(data, coopId, preferId, {
      criarPadraoSeVazio: !isCooperado,
    });
    if (resolved.criou) updateData(() => resolved.data);
    if (resolved.instituicaoId && resolved.instituicaoId !== contratoInstId) {
      setContratoInstId(resolved.instituicaoId);
      setInstituicaoPadraoId(coopId, resolved.instituicaoId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexarModal, data, coopId, reenviarNotaId, isCooperado]);

  useEffect(() => {
    if (!data || !instituicaoId) return;
    const inst = data.instituicoes.find((i) => i.id === instituicaoId);
    setLocalEntrega(inst?.localEntrega ?? inst?.endereco ?? "");
  }, [instituicaoId, data]);

  useEffect(() => {
    if (!data || !avulsoInstId) {
      setAvulsoItens([]);
      avulsoInstIdAnteriorRef.current = "";
      return;
    }
    const instituicaoMudou = avulsoInstIdAnteriorRef.current !== avulsoInstId;
    avulsoInstIdAnteriorRef.current = avulsoInstId;
    setAvulsoItens((prev) => {
      const base = loadItensFromInstituicao(data, avulsoInstId, coopId);
      if (instituicaoMudou || prev.length === 0) return base;
      return base.map((item) => {
        const existente = prev.find((p) => p.produtoInstituicaoId === item.produtoInstituicaoId);
        return existente ? { ...item, quantidade: existente.quantidade } : item;
      });
    });
  }, [avulsoInstId, data, coopId]);

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

  const openLancarAvulso = (preCooperadoId?: string) => {
    const instId = instituicaoPadraoId || instituicoes[0]?.id || "";
    const defaultCoop =
      preCooperadoId && cooperadosCoop.some((c) => c.id === preCooperadoId)
        ? preCooperadoId
        : cooperadosCoop[0]?.id ?? NOVO_AVULSO;
    avulsoInstIdAnteriorRef.current = "";
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
    let cloudCooperadoId: string | undefined;
    let cloudCooperadoNome: string | undefined;
    let cloudNotaId: string | undefined;

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
        cloudCooperadoId = novo.id;
        cloudCooperadoNome = novo.nomeCompleto;
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
      cloudNotaId = nota.id;
      if (!cloudCooperadoNome) {
        cloudCooperadoNome = cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto;
      }

      if (coopId && avulsoInstId) setInstituicaoPadraoId(coopId, avulsoInstId);

      const ficha = buildFichaFromNota(
        nota,
        { ...d, cooperados },
        user.name,
        cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto
      );
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

    void (async () => {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (!cnpj) return;
      if (cloudCooperadoId) {
        const coop = d.cooperados.find((c) => c.id === cloudCooperadoId);
        if (coop) await pushCooperadoToCloud(cnpj, coop);
      }
      const nota = cloudNotaId ? d.notasPedido.find((n) => n.id === cloudNotaId) : undefined;
      if (nota) await pushNotasPedidoToCloud(cnpj, [nota], cloudCooperadoNome);
      await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
    })();

    setAvulsoModal(false);
    setLancadoMsg(`Entrega avulsa registrada! ${formatCurrency(avulsoTotais.liquido)} na ficha do cooperado.`);
    setTimeout(() => setLancadoMsg(""), 6000);
  };

  const pipelineStepLabel = (step: ImagePipelineStep | "idle") => {
    switch (step) {
      case "preparing":
        return "Preparando…";
      case "compressing":
        return "Comprimindo…";
      case "uploading":
        return "Sincronizando em segundo plano…";
      case "success":
        return "Foto adicionada";
      default:
        return processandoFoto ? "Preparando…" : "";
    }
  };

  const aguardarFilaUpload = () => uploadFilaRef.current;

  const enfileirarUploadFoto = (job: () => Promise<void>) => {
    uploadFilaRef.current = uploadFilaRef.current.then(job).catch(() => {});
  };

  const processarFotoArquivo = async (file: File) => {
    if (!data || !cooperadoId || !ANEXAR_DRAFT_KEY || enviando) return;

    if (fotoProcessandoRef.current) {
      fotoAbortRef.current?.abort();
    }
    const abort = new AbortController();
    fotoAbortRef.current = abort;
    lastFotoFileRef.current = file;

    fotoProcessandoRef.current = true;
    setProcessandoFoto(true);
    setFotoDuplicadaMsg("");
    setErroEnvio("");
    setFotoValidationWarning("");
    setFotoPipelineStep("preparing");

    try {
      const validation = validateImageFile(file);
      if (!validation.ok) {
        setErroEnvio(validation.error ?? "Arquivo inválido.");
        setFotoPipelineStep("error");
        return;
      }
      if (validation.warning) setFotoValidationWarning(validation.warning);

      const qtdAtual = await countFotoDraft(ANEXAR_DRAFT_KEY);
      if (fotosSessaoAtingiuLimite(qtdAtual)) {
        setErroEnvio(mensagemLimiteFotosSessao());
        setFotoPipelineStep("idle");
        return;
      }

      const fileFingerprint = await fingerprintFotoFile(file);

      if (await isFotoDraftDuplicadaByFingerprint(ANEXAR_DRAFT_KEY, fileFingerprint)) {
        setFotoDuplicadaMsg("Imagem repetida — esta foto já foi adicionada ou já foi enviada antes.");
        setFotoPipelineStep("idle");
        return;
      }

      if (reenviarNotaId && qtdAtual === 0) {
        await clearFotoDraft(ANEXAR_DRAFT_KEY);
        await getOrCreatePendingNotaId(ANEXAR_DRAFT_KEY, () => reenviarNotaId);
      }

      const resolved = resolverContratoEntrega(data, coopId!, contratoInstId || undefined, {
        criarPadraoSeVazio: false,
      });
      const contratoId = resolved.instituicaoId || contratoInstId;
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (!cnpj) {
        setErroEnvio("CNPJ da cooperativa não encontrado. Verifique a conexão.");
        setFotoPipelineStep("error");
        return;
      }

      setFotoPipelineStep("compressing");
      const processed = await processDeliveryImage(file, abort.signal);

      const cooperadoNome = getCooperadoNome(data.cooperados, cooperadoId);
      const notaId =
        reenviarNotaId ??
        (await getOrCreatePendingNotaId(ANEXAR_DRAFT_KEY, () => generateId("np")));
      const newIndex = await appendFotoDraftMeta(ANEXAR_DRAFT_KEY, contratoId, fileFingerprint);
      const totalCount = newIndex + 1;

      const inst = data.instituicoes.find((i) => i.id === contratoId);
      const localEntregaDraft = inst?.localEntrega ?? inst?.endereco ?? "";
      const now = new Date().toISOString();
      const mes = getCurrentMesReferencia();

      let numeroNota: string;
      let createdAt: string;
      let mesReferencia: string;

      if (reenviarNotaId) {
        const base = data.notasPedido.find((n) => n.id === reenviarNotaId);
        numeroNota = base?.numeroNota ?? gerarNumeroNota(data, coopId!);
        createdAt = base?.createdAt ?? now;
        mesReferencia = base?.mesReferencia ?? mes;
      } else {
        const identity = qtdAtual > 0 ? await getDraftNotaIdentity(ANEXAR_DRAFT_KEY) : null;
        if (identity) {
          numeroNota = identity.numeroNota;
          createdAt = identity.createdAt;
          mesReferencia = identity.mesReferencia;
        } else {
          numeroNota = gerarNumeroNota(data, coopId!);
          createdAt = now;
          mesReferencia = mes;
          await saveDraftNotaIdentity(ANEXAR_DRAFT_KEY, { numeroNota, createdAt, mesReferencia });
        }
      }

      const draftNota: NotaPedido = reenviarNotaId
        ? {
            ...(data.notasPedido.find((n) => n.id === reenviarNotaId) as NotaPedido),
            instituicaoId: contratoId,
            localEntrega: localEntregaDraft,
            fotosEnviadasCount: totalCount,
            status: "rascunho",
            cooperativaCnpj: cnpj,
            cooperadoNomeSnapshot: cooperadoNome,
            updatedAt: now,
          }
        : {
            id: notaId,
            cooperativaId: coopId!,
            cooperadoId,
            instituicaoId: contratoId,
            numeroNota,
            dataEntrega: now.split("T")[0],
            localEntrega: localEntregaDraft,
            itens: [],
            valorBruto: 0,
            percentualDescontoCooperativa: data.config.descontoPadraoCooperativa,
            valorDesconto: 0,
            valorLiquido: 0,
            status: "rascunho",
            fotosEnviadasCount: totalCount,
            mesReferencia,
            cooperativaCnpj: cnpj,
            cooperadoNomeSnapshot: cooperadoNome,
            createdAt,
            updatedAt: now,
          };

      // UI instantânea — libera câmera antes do upload
      setFotosSessaoCount(totalCount);
      setFotosConfirmadasNaSessao(totalCount);
      setFormErrors((err) => ({ ...err, foto: undefined }));
      setFotoPipelineStep("success");
      revokePreviewUrl(processed.previewUrl);
      revokeFotoPreview();
      lastFotoFileRef.current = null;
      if (fotoInputRef.current) fotoInputRef.current.value = "";

      const draftKey = ANEXAR_DRAFT_KEY;
      enfileirarUploadFoto(async () => {
        try {
          await putLocalNotaMedia(notaId, newIndex, processed.compressed, {
            thumbnailBlob: processed.thumbnail,
            mimeType: processed.mimeType,
          });

          const uploaded = await uploadImageToSupabase({
            cnpj,
            nota: draftNota,
            index: newIndex,
            totalCount,
            blob: processed.compressed,
            mimeType: processed.mimeType,
            cooperadoNome,
          });

          if (!uploaded.ok) {
            if (uploaded.offline) {
              await enqueuePendingDeliveryImage({
                id: buildPendingImageId(notaId, newIndex),
                notaPedidoId: notaId,
                cooperativaId: coopId!,
                cooperadoId,
                cnpj,
                index: newIndex,
                totalCount,
                compressedBlob: processed.compressed,
                thumbnailBlob: processed.thumbnail,
                mimeType: processed.mimeType,
                cooperadoNome,
                notaSnapshot: slimNotaDraftForUpload(draftNota),
              });
              await markFotoDraftUploaded(draftKey, newIndex);
              setFotoValidationWarning("Sem internet — foto guardada e será enviada quando voltar a conexão.");
            } else {
              await removeFotoDraftAt(draftKey, newIndex);
              const count = await countFotoDraft(draftKey);
              setFotosSessaoCount(count);
              setFotosConfirmadasNaSessao(count);
              setErroEnvio(uploaded.error ?? "Não foi possível enviar a foto para a nuvem.");
              return;
            }
          } else {
            await markFotoDraftUploaded(draftKey, newIndex);
          }

          setFotosNaNuvemCount(await countFotosUploadedDraft(draftKey));
          requestAppSync();
        } catch {
          setErroEnvio("Falha ao enviar foto em segundo plano. Toque em tentar novamente.");
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setFotoPipelineStep("idle");
        return;
      }
      revokeFotoPreview();
      setErroEnvio(userFacingPipelineError(err));
      setFotoPipelineStep("error");
    } finally {
      fotoProcessandoRef.current = false;
      setProcessandoFoto(false);
      setFotoPipelineStep("idle");
      if (fotoAbortRef.current === abort) fotoAbortRef.current = null;
    }
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fotoInputRef.current) fotoInputRef.current.value = "";
    if (!file || fotoProcessandoRef.current) return;
    await processarFotoArquivo(file);
  };

  const retentarUltimaFoto = () => {
    const file = lastFotoFileRef.current;
    if (!file || processandoFoto) return;
    void processarFotoArquivo(file);
  };

  const removerFotoSessao = (idx: number) => {
    if (!ANEXAR_DRAFT_KEY || !data || !coopId) return;
    void (async () => {
      const meta = await loadFotoDraftMeta(ANEXAR_DRAFT_KEY);
      if (!meta?.count || idx < 0 || idx >= meta.count) return;

      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      const notaId = reenviarNotaId ?? meta.pendingNotaId;
      if (cnpj && notaId && meta.uploadedCount && meta.uploadedCount > 0) {
        const removed = await deleteFotoRascunhoFromCloud(cnpj, notaId, idx, meta.count);
        if (!removed.ok) {
          setErroEnvio(removed.error ?? "Não foi possível remover a foto na nuvem.");
          return;
        }
      }

      await removeFotoDraftAt(ANEXAR_DRAFT_KEY, idx);
      revokeFotoPreview();
      const count = await countFotoDraft(ANEXAR_DRAFT_KEY);
      const uploaded = await countFotosUploadedDraft(ANEXAR_DRAFT_KEY);
      setFotosSessaoCount(count);
      setFotosNaNuvemCount(uploaded);
      setFotosConfirmadasNaSessao(uploaded);

      if (count === 0 && notaId && cnpj) {
        void deleteNotaPedidoFromCloud(cnpj, notaId);
        await clearFotoDraft(ANEXAR_DRAFT_KEY);
      }
    })();
    setFotoDuplicadaMsg("");
    setFormErrors((prev) => ({ ...prev, foto: undefined }));
  };

  const handleAnexarEntrega = async () => {
    if (!data || !user || !coopId || enviando || processandoFoto) return;
    const cid = cooperadoId ?? user.cooperadoId;
    if (!cid) {
      setErroEnvio("Conta sem vínculo de cooperado. Faça login novamente ou fale com a cooperativa.");
      return;
    }

    const preferId = reenviarNotaId
      ? data.notasPedido.find((n) => n.id === reenviarNotaId)?.instituicaoId
      : contratoInstId || undefined;
    const resolved = resolverContratoEntrega(data, coopId, preferId, {
      criarPadraoSeVazio: !isCooperado,
    });
    let workingData = data;
    if (resolved.criou) {
      updateData(() => resolved.data);
      workingData = resolved.data;
    }
    const contratoId = resolved.instituicaoId;
    if (contratoId && contratoId !== contratoInstId) {
      setContratoInstId(contratoId);
      setInstituicaoPadraoId(coopId, contratoId);
    }

    const errors: typeof formErrors = {};
    if (usarEscolaAvulsa && !escolaAvulsaNome.trim()) {
      errors.escolaAvulsa = "Informe o nome da escola.";
    }
    if (fotosSessaoCount === 0) errors.foto = "Tire ou escolha pelo menos uma foto do pedido assinado.";
    if (fotosSessaoCount > 0 && fotosNaNuvemCount < fotosSessaoCount) {
      errors.foto = "Aguarde a sincronização das fotos (alguns segundos) ou verifique a internet.";
    }
    if (processandoFoto) {
      errors.foto = "Aguarde a compressão da foto atual.";
    }
    if (!contratoId) errors.contrato = "Contrato da entrega não encontrado. Aguarde a sincronização ou fale com a cooperativa.";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    const escolaAvulsa = usarEscolaAvulsa ? escolaAvulsaNome.trim() : undefined;
    const local = escolaAvulsa ?? "";
    const now = new Date().toISOString();
    const mes = getCurrentMesReferencia();
    const cooperadoNome = getCooperadoNome(workingData.cooperados, cid);
    const qtdFotos = fotosSessaoCount;

    setEnviando(true);
    setEnvioProgresso(null);
    setErroEnvio("");

    const cnpj = await resolveCooperativaCnpj(workingData, coopId, user);
    if (!cnpj) {
      setEnviando(false);
      setErroEnvio(
        "CNPJ da cooperativa não encontrado. Faça logout e login de novo, ou peça ao responsável para conferir o cadastro."
      );
      return;
    }

    await aguardarFilaUpload();
    await syncOfflineDeliveryImages();
    const uploadedAfterFlush = await countFotosUploadedDraft(ANEXAR_DRAFT_KEY);
    setFotosNaNuvemCount(uploadedAfterFlush);
    if (uploadedAfterFlush < fotosSessaoCount) {
      setEnviando(false);
      setErroEnvio("Ainda há fotos aguardando conexão para subir. Conecte-se à internet e tente de novo.");
      return;
    }

    const cooperadoRecord = workingData.cooperados.find((c) => c.id === cid);
    if (cooperadoRecord) {
      void pushCooperadoToCloud(cnpj, { ...cooperadoRecord, updatedAt: now }, user.email);
    }

    const inst = workingData.instituicoes.find((i) => i.id === contratoId);
    const localEntrega = inst?.localEntrega ?? inst?.endereco ?? local;

    const buildNotaEntrega = async (d: AppData): Promise<NotaPedido | null> => {
      if (reenviarNotaId) {
        const base = d.notasPedido.find((n) => n.id === reenviarNotaId);
        if (!base) return null;
        return {
          ...base,
          instituicaoId: contratoId,
          localEntrega,
          escolaAvulsaNome: escolaAvulsa,
          fotosEnviadasCount: qtdFotos,
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
          fotoPedido: undefined,
          fotosPedido: undefined,
        };
      }

      const notaId =
        ANEXAR_DRAFT_KEY
          ? await getOrCreatePendingNotaId(ANEXAR_DRAFT_KEY, () => generateId("np"))
          : generateId("np");

      const draftIdentity = ANEXAR_DRAFT_KEY ? await getDraftNotaIdentity(ANEXAR_DRAFT_KEY) : null;

      return {
        id: notaId,
        cooperativaId: coopId,
        cooperadoId: cid,
        instituicaoId: contratoId,
        numeroNota: draftIdentity?.numeroNota ?? gerarNumeroNota(workingData, coopId),
        dataEntrega: (draftIdentity?.createdAt ?? now).split("T")[0],
        localEntrega,
        escolaAvulsaNome: escolaAvulsa,
        itens: [],
        valorBruto: 0,
        percentualDescontoCooperativa: workingData.config.descontoPadraoCooperativa,
        valorDesconto: 0,
        valorLiquido: 0,
        status: "aguardando_conferencia",
        fotosEnviadasCount: qtdFotos,
        fotoEnviadaEm: now,
        mesReferencia: draftIdentity?.mesReferencia ?? mes,
        observacoes,
        cooperativaCnpj: cnpj,
        cooperadoNomeSnapshot: cooperadoNome,
        createdAt: draftIdentity?.createdAt ?? now,
        updatedAt: now,
      };
    };

    const notaEntrega = await buildNotaEntrega(workingData);
    if (!notaEntrega) {
      setEnviando(false);
      setErroEnvio("Não foi possível preparar o envio. Tente novamente.");
      return;
    }

    const persistirLocal = (d: AppData, notaFinal: NotaPedido) => {
      const base = compactarFotosNoArmazenamento(liberarEspacoArmazenamento(d, 1));

      if (reenviarNotaId) {
        const updated = base.notasPedido.map((n) => (n.id === reenviarNotaId ? notaFinal : n));
        return addAuditEntry({ ...base, notasPedido: updated }, {
          entityType: "nota_pedido",
          entityId: reenviarNotaId,
          action: "editar",
          userId: user.id,
          userName: user.name,
          changes: notaFinal.fotoNaNuvem ? "Entrega reenviada" : "Entrega em envio",
        });
      }

      const exists = base.notasPedido.some((n) => n.id === notaFinal.id);
      const notasPedido = exists
        ? base.notasPedido.map((n) => (n.id === notaFinal.id ? notaFinal : n))
        : [...base.notasPedido, notaFinal];

      return addAuditEntry({ ...base, notasPedido }, {
        entityType: "nota_pedido",
        entityId: notaFinal.id,
        action: exists ? "editar" : "criar",
        userId: user.id,
        userName: user.name,
        changes: qtdFotos > 1 ? `1 entrega com ${qtdFotos} fotos` : "1 entrega com foto",
      });
    };

    const cloud = await finalizeNotaEntregaNaNuvem(cnpj, notaEntrega, cooperadoNome);
    if (!cloud.ok) {
      setEnviando(false);
      setEnvioProgresso(null);
      setErroEnvio(
        cloud.error ??
          "Falha ao publicar a entrega. As fotos já estão na nuvem — verifique a conexão e toque Enviar de novo."
      );
      return;
    }

    const notaFinalLocal: NotaPedido = {
      ...notaEntrega,
      status: "aguardando_conferencia",
      fotoNaNuvem: true,
      fotoPedido: undefined,
      fotosPedido: undefined,
      fotoPedidoMiniatura: undefined,
      fotosPedidoMiniaturas: undefined,
    };

    let saved = updateDataSafe((d) => persistirLocal(d, notaFinalLocal));
    if (!saved.ok) {
      saved = updateDataSafe((d) => persistirLocal(liberarEspacoArmazenamento(d, 2), notaFinalLocal));
    }

    if (!saved.ok) {
      saved = updateDataSafe((d) =>
        persistirLocal(
          liberarEspacoArmazenamento(compactarFotosNoArmazenamento(d), 2),
          notaFinalLocal
        )
      );
    }

    if (!saved.ok) {
      setEnviando(false);
      setEnvioProgresso(null);
      setErroEnvio(
        `${saved.error} Entrega já está na nuvem — aguarde a sincronização ou toque Enviar de novo.`
      );
      return;
    }

    // Confirma de novo na nuvem ANTES do sync de aba (evita sumir ao ir para Início).
    await finalizeNotaEntregaNaNuvem(cnpj, notaFinalLocal, cooperadoNome);

    setEnviando(false);
    setEnvioProgresso(null);
    limparRascunhoAnexar();
    resetFotosSessaoUi();
    setFotoDuplicadaMsg("");
    setUltimaNotaEnviadaIds([notaFinalLocal.id]);
    setAnexarSucesso(true);
    setSuccessMsg(
      qtdFotos === 1
        ? "Entrega enviada! O responsável já pode conferir a foto."
        : `Entrega enviada com ${qtdFotos} fotos! O responsável já pode conferir.`
    );
    // Sync depois — republicação no provider cobre edge cases.
    requestAppSync();
  };

  const fecharConferirModal = () => {
    if (lancamentoSequenciaTimerRef.current) {
      clearTimeout(lancamentoSequenciaTimerRef.current);
      lancamentoSequenciaTimerRef.current = null;
    }
    setLancamentoSequencia(null);
    revokeConferenciaFotoCache();
    resetConferenciaPorFoto();
    filaConferenciaRef.current = null;
    setFilaConferenciaPos(0);
    setFilaConferenciaTotal(0);
    setConferenciaTransicao(false);
    setConferenciaFotoErro("");
    setConferirModal(false);
    setSelectedNota(null);
  };

  const prepararConferenciaNota = async (nota: NotaPedido, opts?: { transicao?: boolean }) => {
    const d = getData() ?? data;
    if (opts?.transicao) setConferenciaTransicao(true);
    setConferenciaFotoErro("");
    setConferenciaFotoIdx(0);
    resetConferenciaPorFoto();

    let notaComFoto = nota;
    if (d && coopId) {
      notaComFoto = await ensureNotaComFoto(d, nota, coopId);
    }
    const totalFotos = contarFotosEnviadasNota(notaComFoto);
    if (
      notaComFoto.fotoNaNuvem &&
      totalFotos > 0 &&
      getFotosExibicaoNota(notaComFoto).length === 0
    ) {
      revokeConferenciaFotoCache();
      const primeira = await loadConferenciaFoto(notaComFoto, 0);
      if (!primeira) {
        setConferenciaFotoErro(
          "Não foi possível carregar as fotos da nuvem. Verifique a conexão e abra esta entrega de novo."
        );
      }
    }
    setSelectedNota(notaComFoto);
    const instId = coopId
      ? resolverInstituicaoConferencia(coopId, instituicoes, nota.instituicaoId)
      : nota.instituicaoId;
    setConferenciaInstId(instId);
    if (d && instId) {
      const inst = d.instituicoes.find((i) => i.id === instId);
      setConferenciaLocal(inst?.localEntrega ?? inst?.endereco ?? "");
      const multiFoto = totalFotos > 1;
      setConferenciaItens(
        loadItensFromInstituicao(d, instId, coopId, multiFoto ? undefined : nota.itens)
      );
      setConferenciaFotoSomenteLeitura(false);
    } else {
      setConferenciaItens([]);
      setConferenciaLocal("");
    }
    setConferenciaDescontoPct(d?.config.descontoPadraoCooperativa ?? 5);
    const coopDonoId =
      d && coopId
        ? resolverCooperadoIdCanonico(d, nota.cooperadoId, coopId, nota.cooperadoNomeSnapshot)
        : nota.cooperadoId;
    setConferenciaCooperadoId(coopDonoId);
    setConferenciaEscolaAvulsa(nota.escolaAvulsaNome?.trim() ?? "");
    setAlterarInstConferencia(false);
    setConferirErrors({});
    if (!isCooperado && d && coopId) {
      const chave = getChaveGrupoConferencia(nota, d, coopId);
      setAbaConferenciaKey(chave);
      setFiltroCooperadoId(coopDonoId);
    }
    setConferenciaTransicao(false);
  };

  const openConferir = async (nota: NotaPedido) => {
    const d = getData() ?? data;
    if (!isCooperado && d && coopId) {
      const chave = getChaveGrupoConferencia(nota, d, coopId);
      const fila = listarPendentesConferencia(d, coopId, chave);
      filaConferenciaRef.current = { total: fila.length, concluidas: 0, chave };
      setFilaConferenciaPos(1);
      setFilaConferenciaTotal(fila.length);
    } else {
      filaConferenciaRef.current = null;
      setFilaConferenciaPos(0);
      setFilaConferenciaTotal(0);
    }
    await prepararConferenciaNota(nota);
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
        if (chaveGrupo && getChaveGrupoConferencia(n, d, coopIdLocal) !== chaveGrupo) return false;
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const obterProximaNotaConferencia = (chaveGrupo: string, notaConcluidaId: string): NotaPedido | null => {
    if (!coopId) return null;
    const d = getData();
    if (!d) return null;

    const mesmaAba = listarPendentesConferencia(d, coopId, chaveGrupo, notaConcluidaId);
    if (mesmaAba.length > 0) return mesmaAba[0];

    const outras = listarPendentesConferencia(d, coopId, undefined, notaConcluidaId);
    if (outras.length > 0) {
      const proximoGrupo = agruparPendentesPorCooperado(d, outras, coopId)[0];
      if (proximoGrupo) {
        selecionarAbaConferencia(proximoGrupo);
        const filaGrupo = outras.filter(
          (n) => getChaveGrupoConferencia(n, d, coopId) === proximoGrupo.chave
        );
        filaConferenciaRef.current = {
          total: filaGrupo.length,
          concluidas: 0,
          chave: proximoGrupo.chave,
        };
        setFilaConferenciaPos(1);
        setFilaConferenciaTotal(filaGrupo.length);
      }
      return outras[0];
    }
    return null;
  };

  const openView = async (nota: NotaPedido) => {
    let notaComFoto = nota;
    if (getFotosExibicaoNota(nota).length === 0 && data && coopId) {
      notaComFoto = await ensureNotaComFoto(data, nota, coopId);
    }
    setSelectedNota(notaComFoto);
    setViewModal(true);
  };

  const updateConferenciaQty = (idx: number, qty: number) => {
    setConferenciaItens((prev) => prev.map((item, i) => (i === idx ? { ...item, quantidade: qty } : item)));
    setConferirErrors((e) => ({ ...e, itens: undefined }));
  };

  const aguardarSequenciaLancamentoFotos = useCallback(
    async (nota: NotaPedido, total: number): Promise<void> => {
      if (total === 0) return;

      if (lancamentoSequenciaTimerRef.current) {
        clearTimeout(lancamentoSequenciaTimerRef.current);
        lancamentoSequenciaTimerRef.current = null;
      }

      return new Promise((resolve) => {
        let idx = 0;

        const mostrar = async () => {
          const url =
            conferenciaFotoCacheRef.current.get(idx) ??
            (await loadConferenciaFoto(nota, idx));
          if (url) {
            setLancamentoSequencia({ url, displayIdx: idx, total });
          }
        };

        void mostrar();

        const avancar = () => {
          idx += 1;
          if (idx >= total) {
            lancamentoSequenciaTimerRef.current = null;
            setLancamentoSequencia(null);
            resolve();
            return;
          }
          void mostrar();
          lancamentoSequenciaTimerRef.current = setTimeout(avancar, 1400);
        };

        lancamentoSequenciaTimerRef.current = setTimeout(avancar, total === 1 ? 1000 : 1400);
      });
    },
    [loadConferenciaFoto]
  );

  const handleLancarNota = () => {
    if (lancamentoSequencia) return;
    if (lancandoRef.current || !user || !data || !selectedNota) return;
    const errors: typeof conferirErrors = {};
    if (!conferenciaCooperadoId) errors.itens = "Escolha o cooperado dono desta nota.";
    if (Object.keys(errors).length) {
      setConferirErrors(errors);
      return;
    }

    const qtdFotosAprovadas = contarFotosEnviadasNota(selectedNota);
    const fotoAtual = conferenciaFotoIdx;
    const multiFoto = qtdFotosAprovadas > 1;
    const ultimaFoto = fotoAtual >= qtdFotosAprovadas - 1;

    if (multiFoto && !ultimaFoto) {
      if (conferenciaFotoSomenteLeitura) {
        irParaFotoConferencia(fotoAtual + 1);
        return;
      }
      const lanc = lancarFotoConferenciaAtual(fotoAtual, qtdFotosAprovadas);
      if (!lanc.ok) {
        setConferirErrors({ itens: lanc.error });
        return;
      }
      setConferirErrors({});
      setLancadoMsg(`Foto ${fotoAtual + 1} lançada na ficha. Preencha a foto ${fotoAtual + 2}.`);
      setTimeout(() => setLancadoMsg(""), 3500);
      irParaFotoConferencia(fotoAtual + 1);
      return;
    }

    if (conferenciaTotais.liquido <= 0 && !fotosLancadasConferenciaRef.current.has(fotoAtual)) {
      setConferirErrors({ itens: "Informe a quantidade de pelo menos um produto." });
      return;
    }

    if (multiFoto && !fotosLancadasConferenciaRef.current.has(fotoAtual) && !conferenciaFotoSomenteLeitura) {
      const lanc = lancarFotoConferenciaAtual(fotoAtual, qtdFotosAprovadas);
      if (!lanc.ok) {
        setConferirErrors({ itens: lanc.error });
        return;
      }
    }

    lancandoRef.current = true;
    let notaAtualizada: NotaPedido | null = null;
    const notaId = selectedNota.id;
    const chaveAtual = getChaveGrupoConferencia(selectedNota, data, coopId);
    const coopNomeAprovar = getCooperadoNomeResolvido(data, conferenciaCooperadoId, coopId);

    const itensConsolidados = consolidarItensLancamentoPorFoto(
      [...lancamentosFotoConferenciaRef.current.values()]
    );
    const calcConsolidado = calcularItensNota(itensConsolidados, conferenciaDescontoPct);
    const valorAprovado = calcConsolidado.valorLiquido;

    updateData((d) => {
      const now = new Date().toISOString();
      if (coopId && conferenciaInstId) setInstituicaoPadraoId(coopId, conferenciaInstId);
      const coopSel = cooperadosCoop.find((c) => c.id === conferenciaCooperadoId);
      const nomeCoop =
        coopSel?.nomeCompleto?.trim() ||
        selectedNota.cooperadoNomeSnapshot?.trim() ||
        getCooperadoNomeResolvido(d, conferenciaCooperadoId, coopId);
      const cooperadoIdCanonico = resolverCooperadoIdCanonico(
        d,
        conferenciaCooperadoId,
        coopId,
        nomeCoop
      );

      const base = multiFoto
        ? {
            ...selectedNota,
            cooperadoId: cooperadoIdCanonico,
            cooperadoNomeSnapshot: nomeCoop,
            instituicaoId: conferenciaInstId,
            localEntrega: conferenciaLocal,
            escolaAvulsaNome: conferenciaEscolaAvulsa.trim() || selectedNota.escolaAvulsaNome,
            assinaturaRecebedor: selectedNota.assinaturaRecebedor?.trim() || "Assinatura na nota",
            dataAssinatura: selectedNota.dataAssinatura || selectedNota.dataEntrega,
            itens: calcConsolidado.itens,
            valorBruto: calcConsolidado.valorBruto,
            percentualDescontoCooperativa: conferenciaDescontoPct,
            valorDesconto: calcConsolidado.valorDesconto,
            valorLiquido: calcConsolidado.valorLiquido,
            updatedAt: now,
          }
        : aplicarItensNaNota(
            {
              ...selectedNota,
              cooperadoId: cooperadoIdCanonico,
              cooperadoNomeSnapshot: nomeCoop,
              instituicaoId: conferenciaInstId,
              localEntrega: conferenciaLocal,
              escolaAvulsaNome: conferenciaEscolaAvulsa.trim() || selectedNota.escolaAvulsaNome,
              assinaturaRecebedor: selectedNota.assinaturaRecebedor?.trim() || "Assinatura na nota",
              dataAssinatura: selectedNota.dataAssinatura || selectedNota.dataEntrega,
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
      const notasPedido = d.notasPedido.map((n) => (n.id === selectedNota.id ? notaAtualizada! : n));

      if (multiFoto) {
        const arquivosMensais = upsertArquivoMensal(
          d,
          notaAtualizada.cooperadoId,
          notaAtualizada.cooperativaId,
          notaAtualizada.mesReferencia,
          { notaPedidoIds: [notaAtualizada.id] }
        );
        return addAuditEntry(
          { ...d, notasPedido, arquivosMensais },
          {
            entityType: "nota_pedido",
            entityId: selectedNota.id,
            action: "aprovar",
            userId: user.id,
            userName: user.name,
            changes:
              qtdFotosAprovadas > 1
                ? `Entrega conferida (${qtdFotosAprovadas} fotos)`
                : "Entrega conferida",
          }
        );
      }

      const jaNaFicha = d.fichaCorrida.some((f) => f.notaPedidoId === selectedNota.id);
      if (jaNaFicha) {
        return addAuditEntry(
          { ...d, notasPedido },
          {
            entityType: "nota_pedido",
            entityId: selectedNota.id,
            action: "aprovar",
            userId: user.id,
            userName: user.name,
          }
        );
      }
      const ficha = buildFichaFromNota(notaAtualizada, d, user.name, nomeCoop);
      const arquivosMensais = upsertArquivoMensal(
        d,
        notaAtualizada.cooperadoId,
        notaAtualizada.cooperativaId,
        notaAtualizada.mesReferencia,
        { notaPedidoIds: [notaAtualizada.id] }
      );
      return addAuditEntry(
        {
          ...d,
          notasPedido,
          fichaCorrida: [...d.fichaCorrida, ficha],
          arquivosMensais,
        },
        {
          entityType: "nota_pedido",
          entityId: selectedNota.id,
          action: "aprovar",
          userId: user.id,
          userName: user.name,
        }
      );
    });

    requestAppSync();

    if (notaAtualizada && coopId) {
      void (async () => {
        try {
          const cnpj = await resolveCooperativaCnpj(getData(), coopId, user);
          if (!cnpj) return;
          await patchNotaPedidoInCloud(cnpj, notaAtualizada!);
          const d = getData();
          await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
        } finally {
          lancandoRef.current = false;
        }
      })();
    } else {
      lancandoRef.current = false;
    }

    void (async () => {
      try {
        await aguardarSequenciaLancamentoFotos(selectedNota, qtdFotosAprovadas);

        const proxima = obterProximaNotaConferencia(chaveAtual, notaId);

        if (proxima) {
          const mesmoGrupo = filaConferenciaRef.current?.chave === chaveAtual;
          if (filaConferenciaRef.current && mesmoGrupo) {
            filaConferenciaRef.current.concluidas += 1;
            setFilaConferenciaPos(filaConferenciaRef.current.concluidas + 1);
          } else if (filaConferenciaRef.current) {
            setFilaConferenciaPos(1);
          }
          setLancadoMsg(
            `Nota aprovada! ${formatCurrency(valorAprovado)} na ficha de ${coopNomeAprovar.split(" ")[0]}. Abrindo a próxima entrega…`
          );
          setTimeout(() => setLancadoMsg(""), 4000);
          await prepararConferenciaNota(proxima, { transicao: true });
        } else {
          fecharConferirModal();
          setLancadoMsg(
            `Nota aprovada! ${formatCurrency(valorAprovado)} na ficha de ${coopNomeAprovar.split(" ")[0]}. Fila concluída!`
          );
          setTimeout(() => setLancadoMsg(""), 6000);
        }
      } catch {
        /* ignore */
      }
    })();
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
    const dAtual = getData() ?? data;
    const chaveAtual = getChaveGrupoConferencia(selectedNota, dAtual, coopId);
    const proxima = obterProximaNotaConferencia(chaveAtual, notaId);

    setRejectModal(false);
    setMotivoRejeicao("");

    if (proxima) {
      const mesmoGrupo = filaConferenciaRef.current?.chave === chaveAtual;
      if (filaConferenciaRef.current && mesmoGrupo) {
        filaConferenciaRef.current.concluidas += 1;
        setFilaConferenciaPos(filaConferenciaRef.current.concluidas + 1);
      } else if (filaConferenciaRef.current) {
        setFilaConferenciaPos(1);
      }
      setLancadoMsg("Correção enviada ao cooperado. Abrindo a próxima entrega…");
      setTimeout(() => setLancadoMsg(""), 4000);
      void prepararConferenciaNota(proxima, { transicao: true });
    } else {
      fecharConferirModal();
      setLancadoMsg("Correção enviada ao cooperado. Fila concluída!");
      setTimeout(() => setLancadoMsg(""), 5000);
    }
  };

  const handleExcluirPendente = async () => {
    if (!excluirNotaTarget || !user || !data || !coopId) return;
    if (excluirNotaTarget.cooperadoId !== (cooperadoId ?? user.cooperadoId)) return;
    if (
      excluirNotaTarget.status !== "aguardando_conferencia" &&
      excluirNotaTarget.status !== "rejeitada"
    ) {
      return;
    }

    setExcluindo(true);
    const cnpj = await resolveCooperativaCnpj(data, coopId, user);
    if (cnpj) {
      const del = await deleteNotaPedidoFromCloud(cnpj, excluirNotaTarget.id);
      if (!del.ok) {
        queueNotaDelete(cnpj, excluirNotaTarget.id);
      }
    }

    const eraRejeitada = excluirNotaTarget.status === "rejeitada";

    updateData((d) =>
      addAuditEntry(
        { ...d, notasPedido: d.notasPedido.filter((n) => n.id !== excluirNotaTarget.id) },
        {
          entityType: "nota_pedido",
          entityId: excluirNotaTarget.id,
          action: "excluir",
          userId: user.id,
          userName: user.name,
          changes: eraRejeitada
            ? "Entrega devolvida para correção excluída pelo cooperado"
            : "Entrega pendente excluída pelo cooperado",
        }
      )
    );

    setExcluindo(false);
    setExcluirNotaTarget(null);
    setViewModal(false);
    setSuccessMsg(
      eraRejeitada
        ? "Entrega excluída. Você pode enviar uma nova foto quando quiser."
        : "Entrega excluída. O responsável não verá mais esta foto."
    );
  };

  const enviarOutraFoto = () => {
    setAnexarSucesso(false);
    resetFotosSessaoUi();
    setFotoDuplicadaMsg("");
    setErroEnvio("");
    setFormErrors({});
    limparRascunhoAnexar();
  };

  const concluirSessaoEntregas = () => {
    const ids = ultimaNotaEnviadaIds;
    fecharAnexarModal(true);
    setAbaCooperado("entregas");
    const lastId = ids[ids.length - 1];
    if (lastId) {
      requestAnimationFrame(() => {
        document.getElementById(`nota-enviada-${lastId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };

  if (!data) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const renderMobileCard = (n: NotaPedido) => {
    const escola = getEscolaNotaLabel(n, data.instituicoes);
    const recémEnviada = ultimaNotaEnviadaIds.includes(n.id);
    return (
      <button
        type="button"
        id={recémEnviada ? `nota-enviada-${n.id}` : undefined}
        onClick={() => (isCooperado ? openView(n) : n.status === "aguardando_conferencia" ? void openConferir(n) : openView(n))}
        className={cn(
          "w-full text-left bg-white border rounded-xl p-4 transition-colors",
          recémEnviada
            ? "border-green-500 ring-2 ring-green-200 shadow-sm"
            : "border-gray-200 hover:border-green-300"
        )}
      >
        <div className="flex gap-3">
          {getFotoExibicaoNota(n) ? (
            <NotaFotoImg src={getFotoExibicaoNota(n)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
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
            {!isCooperado && n.valorLiquido > 0 && (
              <p className="text-sm font-semibold text-green-700 mt-1">{formatCurrency(n.valorLiquido)}</p>
            )}
          </div>
          <ChevronRight size={18} className="text-gray-300 shrink-0 self-center" />
        </div>
        {isCooperado && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <NotaStatusTimeline status={n.status} valorLiquido={n.valorLiquido} />
          </div>
        )}
        {isCooperado && n.status === "rejeitada" && (
          <div className="flex flex-col gap-2 mt-3">
            <Button size="sm" className="w-full" variant="secondary" onClick={(e) => { e.stopPropagation(); openAnexar(n, { abrirCamera: true }); }}>
              <RefreshCw size={16} /> Enviar de novo
            </Button>
            <Button
              size="sm"
              className="w-full"
              variant="danger"
              onClick={(e) => { e.stopPropagation(); setExcluirNotaTarget(n); }}
            >
              <Trash2 size={16} /> Excluir
            </Button>
          </div>
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

  const cooperadosConferenciaOptions = useMemo(() => {
    if (!data || !coopId) return cooperadosCoop;
    if (!conferenciaCooperadoId) return cooperadosCoop;
    if (cooperadosCoop.some((c) => c.id === conferenciaCooperadoId)) return cooperadosCoop;
    const nome =
      selectedNota?.cooperadoNomeSnapshot?.trim() ||
      getCooperadoNomeResolvido(data, conferenciaCooperadoId, coopId);
    return [
      ...cooperadosCoop,
      {
        id: conferenciaCooperadoId,
        cooperativaId: coopId,
        nomeCompleto: nome,
        cpfCnpj: "",
        telefone: "",
        endereco: "",
        comunidade: "",
        cafDap: "",
        chavePix: "",
        banco: "",
        agencia: "",
        conta: "",
        status: "ativo" as const,
        produtos: [],
        observacoes: "Identificado pelo envio da entrega.",
        createdAt: selectedNota?.createdAt ?? new Date().toISOString(),
        updatedAt: selectedNota?.updatedAt ?? new Date().toISOString(),
      },
    ].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
  }, [cooperadosCoop, conferenciaCooperadoId, data, coopId, selectedNota]);

  const cooperadoConferenciaAutoIdentificado = useMemo(() => {
    if (!selectedNota || !data || !coopId || !conferenciaCooperadoId) return false;
    const canonico = resolverCooperadoIdCanonico(
      data,
      selectedNota.cooperadoId,
      coopId,
      selectedNota.cooperadoNomeSnapshot
    );
    return canonico === conferenciaCooperadoId && Boolean(selectedNota.cooperadoNomeSnapshot?.trim());
  }, [selectedNota, data, coopId, conferenciaCooperadoId]);

  return (
    <div className="relative pb-20 sm:pb-0">
      <PageHeader
        title={isCooperado ? "Minhas entregas" : "Conferir entregas"}
        subtitle={
          isCooperado
            ? abaCooperado === "ficha"
              ? "Extrato financeiro mensal com valores recebidos e detalhamento de cada entrega"
              : "Toque no botão verde para fotografar sua entrega — histórico por mês abaixo"
            : "Analise fotos, lance produtos ou registre entregas avulsas sem nota"
        }
        action={isCooperado ? (
          <div className="hidden sm:block">
            <Button size="lg" onClick={() => openAnexar(undefined, { abrirCamera: true })}>
              <Camera size={18} /> Tirar foto
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

      {isCooperado && rascunhoFotosCount > 0 && !anexarModal && (
        <AlertBanner variant="warning" className="mb-4" title="Fotos não enviadas">
          Você tem {rascunhoFotosCount}{" "}
          {rascunhoFotosCount === 1 ? "foto na nuvem" : "fotos na nuvem"} de uma sessão anterior.
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" onClick={() => continuarRascunhoFotos(true)}>
              Continuar envio
            </Button>
            <Button size="sm" variant="secondary" onClick={limparRascunhoAnexar}>
              Descartar fotos
            </Button>
          </div>
        </AlertBanner>
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
        <AlertBanner variant="warning" className="mb-6" title="Publique um contrato com itens e preços">
          Para conferir entregas, cadastre instituições, itens e preços em{" "}
          <Link href="/contratos" className="font-semibold underline">Contratos</Link>
          {" "}e publique para os cooperados.
        </AlertBanner>
      )}

      {isCooperado && contratosEntrega.length === 0 && (
        <AlertBanner variant="warning" className="mb-6" title="Aguardando contrato da cooperativa">
          O responsável ainda não publicou um contrato com itens e preços. Veja o status no topo
          (“Atualizando…” / “Atualizado”) ou fale com a cooperativa.
        </AlertBanner>
      )}

      {!isCooperado && pendentesTodas.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Fila para conferir ({totalFotosPendentes} {totalFotosPendentes === 1 ? "foto" : "fotos"}
                {pendentesTodas.length > 1 ? ` · ${pendentesTodas.length} entregas` : ""})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Escolha o cooperado abaixo ou nas abas — toque em um card para conferir as fotos.
              </p>
            </div>
            {grupoAbaAtiva && (
              <p className="text-xs font-medium text-amber-800">
                {fotosAbaAtiva} {fotosAbaAtiva === 1 ? "foto" : "fotos"} de {grupoAbaAtiva.nome}
                {pendentesAbaAtiva.length > 1 ? ` (${pendentesAbaAtiva.length} entregas)` : ""}
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
                aria-selected={abaConferenciaEfetiva === grupo.chave}
                onClick={() => selecionarAbaConferencia(grupo)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-semibold border border-b-0 transition-colors",
                  abaConferenciaEfetiva === grupo.chave
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-amber-50 hover:border-amber-300"
                )}
              >
                {grupo.nome}
                <span
                  className={cn(
                    "min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold inline-flex items-center justify-center",
                    abaConferenciaEfetiva === grupo.chave ? "bg-white/25 text-white" : "bg-amber-100 text-amber-800"
                  )}
                >
                  {contarFotosEnviadasNotas(grupo.notas)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendentesAbaAtiva.length === 0 ? (
              <p className="col-span-full text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
                Nenhuma entrega pendente para este cooperado. Selecione outra aba acima.
              </p>
            ) : null}
            {pendentesAbaAtiva.map((n) => {
              const qtdFotosCard = contarFotosEnviadasNota(n);
              return (
              <button key={n.id} type="button" onClick={() => openConferir(n)} className="text-left border-2 border-amber-300 bg-amber-50 rounded-xl overflow-hidden hover:border-amber-500 relative">
                {getFotoExibicaoNota(n) && (
                  <NotaFotoImg src={getFotoExibicaoNota(n)} alt="" className="w-full h-36 object-cover" />
                )}
                {qtdFotosCard > 1 && (
                  <span className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {qtdFotosCard} fotos
                  </span>
                )}
                <div className="p-3">
                  <p className="font-medium text-sm">{formatDate(n.dataEntrega)} · {n.numeroNota}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{getEscolaNotaLabel(n, data.instituicoes)}</p>
                </div>
              </button>
            );})}
          </div>
        </div>
      )}

      {isCooperado && (
        <p className="text-sm text-gray-600 mb-4">
          {abaCooperado === "entregas" ? (
            <>
              Cada mês lista Entrega 1, 2, 3… Toque na entrega para abrir a foto. Valores consolidados ficam em{" "}
              <button type="button" onClick={() => setAbaCooperado("ficha")} className="text-green-700 font-semibold underline">
                Minha ficha
              </button>
              .
            </>
          ) : (
            <>
              Resumo financeiro por mês. Valores em aberto também em{" "}
              <Link href="/ficha-corrida" className="text-green-700 font-semibold">Quanto vou receber</Link>.
            </>
          )}
        </p>
      )}

      {isCooperado && (
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setAbaCooperado("entregas")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
              abaCooperado === "entregas"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Package size={16} /> Minhas entregas
          </button>
          <button
            type="button"
            onClick={() => setAbaCooperado("ficha")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2",
              abaCooperado === "ficha"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <BookOpen size={16} /> Minha ficha
          </button>
        </div>
      )}

      {isCooperado && abaCooperado === "entregas" && (
        <button
          type="button"
          onClick={() => openAnexar(undefined, { abrirCamera: true })}
          className="w-full mb-6 rounded-2xl bg-gradient-to-br from-green-600 to-green-700 text-white shadow-lg shadow-green-900/20 p-5 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <Camera size={32} strokeWidth={2.25} />
          </span>
          <span className="flex-1 text-left min-w-0">
            <span className="block text-lg font-bold leading-tight">Tirar foto da entrega</span>
            <span className="block text-sm text-green-100 mt-1">
              Um toque abre a câmera — até {MAX_FOTOS_POR_SESSAO_ENTREGA} fotos por entrega
            </span>
          </span>
          <ChevronRight size={22} className="shrink-0 text-green-200" />
        </button>
      )}

      <FilterBar>
        {!isCooperado && pendentesPorCooperado.length > 0 && (
          <FormField label="Cooperado para conferir">
            <Select
              value={grupoAbaAtiva?.cooperadoId ?? filtroCooperadoId}
              onChange={(e) => {
                const grupo = pendentesPorCooperado.find((g) => g.cooperadoId === e.target.value);
                if (grupo) selecionarAbaConferencia(grupo);
                else setFiltroCooperadoId(e.target.value);
              }}
              className="min-w-[220px]"
            >
              {pendentesPorCooperado.map((g) => (
                <option key={g.chave} value={g.cooperadoId}>
                  {g.nome} ({contarFotosEnviadasNotas(g.notas)} {contarFotosEnviadasNotas(g.notas) === 1 ? "foto" : "fotos"})
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {isCooperado && abaCooperado === "entregas" && (
          <FormField label="Filtrar entregas">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[200px]">
              <option value="pendentes">Pendentes</option>
              <option value="">Histórico completo</option>
              <option value="aguardando_conferencia">Em análise</option>
              <option value="rejeitada">Precisa corrigir</option>
              <option value="conferida">Aprovadas</option>
              <option value="pago">Pagas</option>
            </Select>
          </FormField>
        )}
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
        {!isCooperado && (
        <FormField label="Filtrar">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="aguardando_conferencia">Em análise</option>
            <option value="rejeitada">Precisa corrigir</option>
            <option value="conferida">Aprovadas</option>
            <option value="pago">Pagas</option>
          </Select>
        </FormField>
        )}
      </FilterBar>

      {isCooperado ? (
        abaCooperado === "ficha" ? (
          <CooperadoMinhaFichaTab
            cooperadoId={cooperadoId!}
            cooperativaId={coopId}
            nomeCooperado={nomeCooperadoExibicao}
            resumos={resumosFichaCooperado}
            getEscolaLabel={(n) => getEscolaNotaLabel(n, data.instituicoes)}
          />
        ) : statusFilter && resumosMensaisCooperado.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border">
            <Camera size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">
              {statusFilter === "pendentes" ? "Nenhuma entrega pendente" : "Nenhuma entrega com este filtro"}
            </p>
            <p className="text-sm mt-1">
              {statusFilter === "pendentes"
                ? "Entregas aprovadas ou pagas ficam no histórico completo."
                : "Toque em Histórico completo para ver todas as entregas."}
            </p>
          </div>
        ) : (
          <CooperadoEntregasPorMes
            resumos={resumosMensaisCooperado}
            nomeCooperado={nomeCooperadoExibicao}
            ultimaNotaEnviadaIds={ultimaNotaEnviadaIds}
            onReenviar={(n) => openAnexar(n, { abrirCamera: true })}
            onExcluir={(n) => setExcluirNotaTarget(n)}
            getEscolaLabel={(n) => getEscolaNotaLabel(n, data.instituicoes)}
          />
        )
      ) : (
      <DataTable
        data={notas}
        keyField="id"
        mobileCard={renderMobileCard}
        emptyMessage="Nenhuma entrega registrada."
        columns={[
          { key: "numero", label: "Nota", render: (n) => n.numeroNota },
          { key: "data", label: "Data", render: (n) => formatDate(n.dataEntrega) },
          { key: "coop", label: "Cooperado", render: (n: NotaPedido) => getCooperadoNome(data.cooperados, n.cooperadoId) },
          { key: "escola", label: "Escola", render: (n) => getEscolaNotaLabel(n, data.instituicoes) },
          {
            key: "tipo",
            label: "Tipo",
            render: (n) => (n.lancamentoDireto ? <span className="text-xs text-amber-700 font-medium">Avulso</span> : "Com nota"),
          },
          { key: "valor", label: "Valor", render: (n) => (n.valorLiquido > 0 ? formatCurrency(n.valorLiquido) : "—") },
          { key: "status", label: "Status", render: (n) => <NotaStatusBadge status={n.status} /> },
        ]}
        onView={(n) => (n.status === "aguardando_conferencia" ? void openConferir(n) : openView(n))}
        viewLabel="Conferir"
      />
      )}

      {isCooperado && (
        <div className="fixed bottom-20 right-4 z-30 sm:hidden">
          <Button size="lg" className="shadow-lg rounded-full px-5" onClick={() => openAnexar(undefined, { abrirCamera: true })}>
            <Camera size={20} /> Tirar foto
          </Button>
        </div>
      )}

      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFoto(e)}
        disabled={processandoFoto || enviando || limiteFotosSessaoAtingido}
      />

      <Modal
        open={anexarModal}
        onClose={() => fecharAnexarModal()}
        title={anexarSucesso ? "Entrega enviada!" : reenviarNotaId ? "Enviar de novo" : "Enviar fotos da entrega"}
        size="md"
        footer={
          anexarSucesso ? (
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button type="button" variant="secondary" onClick={enviarOutraFoto}>
                Enviar outra entrega
              </Button>
              <Button type="button" size="lg" onClick={concluirSessaoEntregas}>
                <CheckCircle size={18} /> Ver minhas entregas
              </Button>
            </div>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button type="button" variant="secondary" disabled={enviando} onClick={() => fecharAnexarModal()}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => void handleAnexarEntrega()}
                disabled={
                  fotosSessaoCount === 0 ||
                  fotosNaNuvemCount < fotosSessaoCount ||
                  enviando ||
                  processandoFoto
                }
                className={cn(
                  limiteFotosSessaoAtingido &&
                    fotosSessaoCount > 0 &&
                    fotosNaNuvemCount >= fotosSessaoCount &&
                    "ring-2 ring-amber-400 ring-offset-2 shadow-md"
                )}
              >
                <FileText size={18} />{" "}
                {enviando
                  ? "Publicando para o responsável…"
                  : processandoFoto
                    ? "Enviando foto para a nuvem…"
                  : fotosSessaoCount > 0
                    ? `Enviar para o responsável${fotosSessaoCount > 1 ? ` (${fotosSessaoCount} fotos)` : ""}`
                    : "Tire uma foto primeiro"}
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-4">
          {anexarSucesso ? (
            <AlertBanner variant="success" title="Entrega registrada">
              {successMsg || "Sua foto foi enviada para a cooperativa. Ela aparece na lista como Em análise."}
            </AlertBanner>
          ) : (
            <>
          {erroEnvio && (
            <AlertBanner variant="error" onDismiss={() => setErroEnvio("")}>
              {erroEnvio}
            </AlertBanner>
          )}
          <p className="text-sm text-gray-600">
            {reenviarNotaId
              ? "Tire a nova foto — pode tirar a próxima na hora; o envio roda em segundo plano."
              : `Tire as fotos do pedido (até ${MAX_FOTOS_POR_SESSAO_ENTREGA} por entrega). O envio para a nuvem é automático em segundo plano.`}
          </p>

          {!reenviarNotaId && limiteFotosSessaoAtingido && (
            <AlertBanner variant="info" title="Limite desta entrega atingido">
              <p>Você já tirou o máximo de {MAX_FOTOS_POR_SESSAO_ENTREGA} fotos nesta entrega.</p>
              <ol className="mt-2 space-y-1.5 list-decimal list-inside">
                <li>
                  Toque em <span className="font-semibold">Enviar para o responsável</span> abaixo para concluir
                </li>
                <li>
                  Depois use <span className="font-semibold">Enviar outra entrega</span> para fotografar mais pedidos
                </li>
              </ol>
            </AlertBanner>
          )}

          {!reenviarNotaId && proximoDoLimiteFotos && (
            <AlertBanner variant="warning" title={`${fotosRestantesNaSessao(fotosSessaoCount)} foto(s) restante(s) nesta entrega`}>
              Após {MAX_FOTOS_POR_SESSAO_ENTREGA} fotos, envie ao responsável. As fotos já tiradas continuam subindo em segundo plano.
            </AlertBanner>
          )}

          {!reenviarNotaId && (
            <div className={cn(
              "rounded-xl border p-4",
              limiteFotosSessaoAtingido
                ? "border-amber-300 bg-amber-50/70"
                : "border-green-200 bg-green-50/60"
            )}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={cn(
                  "text-sm font-semibold flex items-center gap-2",
                  limiteFotosSessaoAtingido ? "text-amber-900" : "text-green-900"
                )}>
                  <ImagePlus size={18} />
                  {fotosSessaoCount === 0
                    ? "Nenhuma foto ainda"
                    : `${fotosSessaoCount} de ${MAX_FOTOS_POR_SESSAO_ENTREGA} ${fotosSessaoCount === 1 ? "foto" : "fotos"}`}
                </span>
                {fotosSessaoCount > 0 && (
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full",
                    limiteFotosSessaoAtingido
                      ? "bg-amber-200 text-amber-900"
                      : fotosNaNuvemCount >= fotosSessaoCount
                        ? "bg-green-200 text-green-800"
                        : "bg-amber-100 text-amber-900"
                  )}>
                    {limiteFotosSessaoAtingido
                      ? "Enviar agora"
                      : fotosNaNuvemCount >= fotosSessaoCount
                        ? "Pronta"
                        : `${fotosNaNuvemCount}/${fotosSessaoCount} na nuvem`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 bg-white/70 rounded-full overflow-hidden border border-black/5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      limiteFotosSessaoAtingido ? "bg-amber-500" : "bg-green-600"
                    )}
                    style={{
                      width: `${Math.min(100, (fotosSessaoCount / MAX_FOTOS_POR_SESSAO_ENTREGA) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] font-bold text-gray-600 tabular-nums shrink-0">
                  {fotosSessaoCount}/{MAX_FOTOS_POR_SESSAO_ENTREGA}
                </span>
              </div>
              <p className={cn(
                "text-xs",
                limiteFotosSessaoAtingido ? "text-amber-900" : "text-green-800"
              )}>
                {processandoFoto
                  ? pipelineStepLabel(fotoPipelineStep)
                  : limiteFotosSessaoAtingido
                    ? "Envie ao responsável para concluir. Depois inicie outra entrega para tirar mais fotos."
                    : fotosSessaoCount === 0
                      ? "Toque abaixo para tirar a primeira foto."
                      : fotosNaNuvemCount >= fotosSessaoCount
                        ? proximoDoLimiteFotos
                          ? `Pode tirar mais ${fotosRestantesNaSessao(fotosSessaoCount)} foto(s) ou enviar ao responsável.`
                          : "Todas sincronizadas. Tire mais fotos ou envie ao responsável."
                        : "Pode tirar a próxima foto — sincronização em segundo plano."}
              </p>
            </div>
          )}

          {fotoValidationWarning && (
            <AlertBanner variant="warning" onDismiss={() => setFotoValidationWarning("")}>
              {fotoValidationWarning}
            </AlertBanner>
          )}

          {fotoDuplicadaMsg && (
            <AlertBanner variant="error" onDismiss={() => setFotoDuplicadaMsg("")}>
              {fotoDuplicadaMsg}
            </AlertBanner>
          )}

          {!reenviarNotaId && fotosSessaoCount > 0 && (
            <div className={cn("flex flex-wrap items-center gap-2", fotosSessaoCount > 12 && "max-h-24 overflow-y-auto pr-1")}>
              {Array.from({ length: fotosSessaoCount }, (_, i) => {
                const n = i + 1;
                const naNuvem = fotosNaNuvemCount >= n;
                return (
                  <span
                    key={n}
                    className={cn(
                      "text-xs font-semibold px-2.5 py-1 rounded-full border",
                      naNuvem
                        ? "bg-green-100 border-green-400 text-green-800"
                        : "bg-amber-100 border-amber-400 text-amber-900"
                    )}
                  >
                    Foto {n}
                    {naNuvem ? " ✓" : " · sync…"}
                  </span>
                );
              })}
              {fotosNaNuvemCount >= fotosSessaoCount && (
                <span className="text-xs text-green-700">Pronta para enviar ao responsável</span>
              )}
            </div>
          )}

          {(fotoPipelineStep === "error" || erroEnvio) && lastFotoFileRef.current && !processandoFoto && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={retentarUltimaFoto}>
                <RefreshCw size={14} className="mr-1" /> Tentar novamente
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={abrirCameraAnexar}
              >
                <Camera size={14} className="mr-1" /> Tirar outra foto
              </Button>
            </div>
          )}

          {!reenviarNotaId && !enviando && !limiteFotosSessaoAtingido && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={processandoFoto}
                onClick={abrirCameraAnexar}
              >
                <Camera size={14} className="mr-1" />
                {fotosSessaoCount === 0 ? "Tirar foto" : "Tirar próxima foto"}
              </Button>
              {fotosSessaoCount > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={processandoFoto}
                  onClick={() => removerFotoSessao(fotosSessaoCount - 1)}
                >
                  <X size={14} className="mr-1" /> Remover última
                </Button>
              )}
            </div>
          )}

          <FormField
            label={
              reenviarNotaId
                ? "Nova foto"
                : processandoFoto
                  ? "Comprimindo foto…"
                  : fotosSessaoCount > 0
                    ? `Foto ${fotosSessaoCount + 1} desta entrega`
                    : "Foto da entrega"
            }
            required
            error={formErrors.foto}
            hint="Mostre o pedido inteiro com a assinatura de quem recebeu."
          >
            {fotoAtualPreview && processandoFoto ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-amber-300 bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoAtualPreview}
                  alt={`Foto ${fotosConfirmadasNaSessao + 1}`}
                  className="w-full max-h-72 object-contain mx-auto bg-gray-900/5 opacity-90"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="bg-amber-600 text-white text-sm font-semibold px-3 py-2 rounded-full">
                    {pipelineStepLabel(fotoPipelineStep)}
                  </span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={abrirCameraAnexar}
                disabled={processandoFoto || enviando || limiteFotosSessaoAtingido}
                className={`w-full flex flex-col items-center gap-2 p-8 border-2 border-dashed rounded-2xl ${
                  limiteFotosSessaoAtingido
                    ? "border-amber-400 bg-amber-50/80 opacity-90"
                    : processandoFoto || enviando
                      ? "border-green-500 bg-green-50 opacity-60 pointer-events-none"
                      : "border-green-500 bg-green-50 cursor-pointer active:bg-green-100 active:border-green-600"
                }`}
              >
                <Camera
                  size={52}
                  className={limiteFotosSessaoAtingido ? "text-amber-700" : "text-green-700"}
                  strokeWidth={2.25}
                />
                <span className={cn(
                  "text-lg font-bold text-center",
                  limiteFotosSessaoAtingido ? "text-amber-900" : "text-green-900"
                )}>
                  {limiteFotosSessaoAtingido
                    ? "Limite de fotos atingido"
                    : processandoFoto
                      ? pipelineStepLabel(fotoPipelineStep)
                      : fotosSessaoCount === 0
                        ? "Tirar foto agora"
                        : "Tirar próxima foto"}
                </span>
                <span className={cn(
                  "text-sm text-center",
                  limiteFotosSessaoAtingido ? "text-amber-800" : "text-green-700"
                )}>
                  {limiteFotosSessaoAtingido
                    ? "Envie ao responsável abaixo. Depois inicie outra entrega."
                    : processandoFoto
                      ? "Só um instante…"
                      : fotosSessaoCount === 0
                        ? "Toque para abrir a câmera"
                        : `Mais ${fotosRestantesNaSessao(fotosSessaoCount)} foto(s) nesta entrega — envio em segundo plano`}
                </span>
              </button>
            )}
          </FormField>

          <FormField label="Contrato" required error={formErrors.contrato} hint={isCooperado ? "Selecionado automaticamente — altere só se precisar." : "A entrega será conferida e lançada neste contrato."}>
            {contratosEntrega.length === 0 ? (
              <AlertBanner variant="warning">
                Nenhum contrato disponível. {isCooperado
                  ? "Aguarde a sincronização com a cooperativa."
                  : "Cadastre itens com preço em Contratos e Preços."}
              </AlertBanner>
            ) : contratosEntrega.length <= 1 ? (
              <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex items-start gap-3">
                <FileSignature size={22} className="text-green-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900">
                    {contratoSelecionado ? getContratoLabel(contratoSelecionado) : "Contrato da cooperativa"}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Contrato publicado pelo responsável — selecionado automaticamente.
                  </p>
                </div>
              </div>
            ) : (
              <Select
                value={contratoInstId}
                onChange={(e) => {
                  setContratoInstId(e.target.value);
                  if (coopId && e.target.value) setInstituicaoPadraoId(coopId, e.target.value);
                  setFormErrors((prev) => ({ ...prev, contrato: undefined }));
                }}
              >
                {contratosEntrega.map((c) => (
                  <option key={c.id} value={c.id}>{getContratoLabel(c)}</option>
                ))}
              </Select>
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
            </>
          )}
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
              <p className="text-sm font-semibold text-gray-800">
                Quantidades entregues — preços do contrato
              </p>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Toque nas caixas amarelas abaixo e informe a quantidade de cada item.
              </p>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {avulsoItens.map((item, idx) => (
                  <div
                    key={item.produtoInstituicaoId}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2",
                      item.quantidade > 0
                        ? "bg-green-50/70 border-green-200"
                        : "bg-white border-amber-200"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{item.produtoNome}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(item.precoUnitario)} / {labelUnidade(item.unidade)}</p>
                    </div>
                    <div className="shrink-0 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Quantidade</p>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Quantidade de ${item.produtoNome}`}
                        placeholder="0"
                        className={qtyInputClassName(item.quantidade > 0, "w-28")}
                        value={item.quantidade === 0 ? "" : item.quantidade}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || raw === ".") {
                            updateAvulsoQty(idx, 0);
                            return;
                          }
                          const qty = parseFloat(raw);
                          if (!Number.isNaN(qty)) updateAvulsoQty(idx, qty);
                        }}
                      />
                      <p className="text-[10px] font-medium text-gray-600 mt-1">{labelUnidade(item.unidade)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-right text-lg font-bold text-green-700">Total: {formatCurrency(avulsoTotais.liquido)}</p>
            </>
          )}
        </div>
      </Modal>

      <Modal open={conferirModal} onClose={fecharConferirModal} title={
        filaConferenciaTotal > 1
          ? `Conferir entrega (${filaConferenciaPos} de ${filaConferenciaTotal})`
          : "Conferir entrega"
      } size="full"
        footer={selectedNota?.status === "aguardando_conferencia" && check("notas_pedido", "approve") ? (
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <Button variant="danger" onClick={() => { setMotivoRejeicao(""); setRejectModal(true); }} disabled={conferenciaTransicao || Boolean(lancamentoSequencia)}>
              <XCircle size={18} /> Pedir correção
            </Button>
            <Button size="lg" onClick={handleLancarNota} disabled={conferenciaTransicao || Boolean(lancamentoSequencia)}>
              <CheckCircle size={18} />
              {(() => {
                if (lancamentoSequencia) {
                  return `Lançando foto ${lancamentoSequencia.displayIdx + 1} de ${lancamentoSequencia.total}…`;
                }
                if (conferenciaTransicao) return "Carregando próxima entrega…";
                if (!selectedNota) return "Aprovar e lançar na ficha";
                const qtdFotosBtn = contarFotosEnviadasNota(selectedNota);
                const multiFotoBtn = qtdFotosBtn > 1;
                const ultimaFotoBtn = conferenciaFotoIdx >= qtdFotosBtn - 1;
                if (multiFotoBtn && conferenciaFotoSomenteLeitura && !ultimaFotoBtn) {
                  return "Próxima foto";
                }
                if (multiFotoBtn && !ultimaFotoBtn) {
                  return `Lançar foto ${conferenciaFotoIdx + 1} e continuar`;
                }
                if (multiFotoBtn && ultimaFotoBtn) {
                  return filaConferenciaTotal > 1
                    ? `Concluir entrega · próxima (${filaConferenciaPos}/${filaConferenciaTotal})`
                    : "Concluir entrega (última foto)";
                }
                if (filaConferenciaTotal > 1) {
                  return `Aprovar e próxima (${filaConferenciaPos}/${filaConferenciaTotal})`;
                }
                return "Aprovar e lançar na ficha";
              })()}
            </Button>
          </div>
        ) : undefined}
      >
        <div className="relative">
        {conferenciaTransicao && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <p className="text-sm font-medium text-gray-700">Carregando próxima entrega…</p>
          </div>
        )}
        {selectedNota && (
          <div className="flex flex-col lg:flex-row min-h-[calc(100dvh-8.5rem)]">
            <div className="lg:w-[48%] xl:w-1/2 bg-gray-900 flex flex-col shrink-0 lg:min-h-[calc(100dvh-8.5rem)]">
              <div className="flex-1 flex items-center justify-center p-4 min-h-[40vh] lg:min-h-0 overflow-y-auto">
                {(() => {
                  if (lancamentoSequencia) {
                    const { url, displayIdx, total } = lancamentoSequencia;
                    return (
                      <div className="w-full space-y-4 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Lançada ${displayIdx + 1} de ${total}`}
                          className="max-w-full max-h-[70vh] lg:max-h-[calc(100dvh-12rem)] object-contain mx-auto ring-4 ring-green-500/50"
                        />
                        <p className="text-green-400 font-semibold text-base">
                          Foto {displayIdx + 1} de {total} · Lançada na ficha ✓
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {Array.from({ length: total }, (_, i) => (
                            <span
                              key={i}
                              className={cn(
                                "text-xs font-semibold px-2.5 py-1 rounded-full border",
                                i <= displayIdx
                                  ? "bg-green-500/20 border-green-400 text-green-200"
                                  : "bg-white/10 border-white/20 text-white/50"
                              )}
                            >
                              Foto {i + 1}{i <= displayIdx ? " ✓" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  const totalFotos = contarFotosEnviadasNota(selectedNota);
                  const idx = Math.min(conferenciaFotoIdx, Math.max(0, totalFotos - 1));
                  if (totalFotos > 0) {
                    return (
                      <div className="w-full space-y-3">
                        {conferenciaFotoCarregando && !conferenciaFotoAtualUrl ? (
                          <p className="text-white/70 text-sm text-center py-12">Carregando foto…</p>
                        ) : conferenciaFotoAtualUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={conferenciaFotoAtualUrl}
                            alt={`Pedido ${idx + 1} de ${totalFotos}`}
                            className="max-w-full max-h-[70vh] lg:max-h-[calc(100dvh-12rem)] object-contain mx-auto"
                          />
                        ) : null}
                        {totalFotos > 1 && (
                          <>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              {Array.from({ length: totalFotos }, (_, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => irParaFotoConferencia(i)}
                                  className={cn(
                                    "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                                    i === idx
                                      ? "border-green-400 bg-green-500/20 text-green-100"
                                      : fotosLancadasUi.has(i)
                                        ? "border-green-600/60 bg-green-900/30 text-green-200"
                                        : "border-white/20 text-white/70 hover:border-white/40"
                                  )}
                                >
                                  Foto {i + 1}
                                  {fotosLancadasUi.has(i) ? " ✓" : ""}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center justify-center gap-3 text-white/90 text-sm">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={idx <= 0}
                                onClick={() => irParaFotoConferencia(idx - 1)}
                              >
                                Anterior
                              </Button>
                              <span className="font-medium tabular-nums">
                                Foto {idx + 1} de {totalFotos}
                              </span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={idx >= totalFotos - 1}
                                onClick={() => irParaFotoConferencia(idx + 1)}
                              >
                                Próxima foto
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }
                  if (conferenciaFotoErro) {
                    return (
                      <div className="text-center py-12 px-4 space-y-3">
                        <p className="text-red-300 text-sm">{conferenciaFotoErro}</p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => selectedNota && void prepararConferenciaNota(selectedNota, { transicao: true })}
                        >
                          Tentar carregar de novo
                        </Button>
                      </div>
                    );
                  }
                  if (conferenciaTransicao) {
                    return <p className="text-gray-400 text-center py-12">Carregando fotos da nuvem...</p>;
                  }
                  if (selectedNota.fotoNaNuvem && contarFotosEnviadasNota(selectedNota) > 0) {
                    return (
                      <div className="text-center py-12 px-4 space-y-3">
                        <p className="text-red-300 text-sm">
                          Fotos na nuvem, mas não carregaram neste aparelho. Verifique a conexão.
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => selectedNota && void prepararConferenciaNota(selectedNota, { transicao: true })}
                        >
                          Tentar carregar de novo
                        </Button>
                      </div>
                    );
                  }
                  return <p className="text-gray-400 text-center py-12">Sem foto</p>;
                })()}
              </div>
              <div className="shrink-0 px-4 py-3 bg-black/40 text-white text-sm space-y-0.5">
                <p><strong>{getCooperadoNomeResolvido(data, selectedNota.cooperadoId, coopId)}</strong> · {formatDate(selectedNota.dataEntrega)}</p>
                <p className="text-white/80">
                  {getEscolaNotaLabel(selectedNota, data.instituicoes)} · {selectedNota.numeroNota}
                  {(() => {
                    const qtd = getFotosExibicaoNota(selectedNota).length;
                    return qtd > 1 ? ` · ${qtd} fotos` : "";
                  })()}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 bg-gray-50">
              {filaConferenciaTotal > 1 && (
                <AlertBanner variant="info" title={`Fila: ${filaConferenciaPos} de ${filaConferenciaTotal} entregas`}>
                  Ao aprovar, a próxima entrega abre aqui mesmo — sem fechar a tela — até lançar todas.
                </AlertBanner>
              )}
              {(() => {
                const qtdFotosModal = getFotosExibicaoNota(selectedNota).length;
                if (qtdFotosModal <= 1) return null;
                const idxModal = Math.min(conferenciaFotoIdx, qtdFotosModal - 1);
                return (
                  <AlertBanner variant="info" title={`${qtdFotosModal} fotos nesta entrega · foto ${idxModal + 1} de ${qtdFotosModal}`}>
                    {conferenciaFotoSomenteLeitura
                      ? "Esta foto já foi lançada na ficha. Avance para a próxima ou volte para conferir."
                      : "Preencha as quantidades desta foto e toque em «Lançar foto e continuar». A próxima foto abre com quantidades zeradas."}
                  </AlertBanner>
                );
              })()}
              {lancadoMsg && (
                <AlertBanner variant="success" onDismiss={() => setLancadoMsg("")}>
                  {lancadoMsg}
                </AlertBanner>
              )}
              <FormField label="Cooperado" required hint="Quem receberá o valor na ficha">
                <Select value={conferenciaCooperadoId} onChange={(e) => setConferenciaCooperadoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {cooperadosConferenciaOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.nomeCompleto}{c.avulso ? " (avulso)" : ""}</option>
                  ))}
                </Select>
                {cooperadoConferenciaAutoIdentificado && (
                  <p className="text-xs text-green-700 mt-1">
                    Identificado automaticamente pelo envio: {selectedNota.cooperadoNomeSnapshot}
                  </p>
                )}
                {cooperadosConferenciaOptions.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">Carregando cooperados da nuvem…</p>
                )}
              </FormField>

              <div className="rounded-xl border border-green-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Contrato / instituição</p>
                    {!alterarInstConferencia ? (
                      <p className="font-semibold text-gray-900 mt-1">{conferenciaInstNome || "—"}</p>
                    ) : (
                      <div className="mt-2">
                        <Select value={conferenciaInstId} onChange={(e) => handleConferenciaInstChange(e.target.value)}>
                          {instituicoes.map((i) => (
                            <option key={i.id} value={i.id}>{i.nome}</option>
                          ))}
                        </Select>
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

              {(selectedNota.escolaAvulsaNome || !selectedNota.instituicaoId) && (
                <FormField label="Nome da escola (avulso)" hint="Quando a entrega não está no contrato cadastrado">
                  <Input
                    value={conferenciaEscolaAvulsa}
                    onChange={(e) => setConferenciaEscolaAvulsa(e.target.value)}
                    placeholder="Digite o nome da escola"
                  />
                </FormField>
              )}

              <FormField label="Desconto cooperativa (%)">
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

              {conferenciaItens.length === 0 ? (
                <AlertBanner variant="warning">
                  Este contrato ainda não tem itens.{" "}
                  <Link href="/contratos" className="font-semibold underline">Cadastrar em Contratos</Link>
                </AlertBanner>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="bg-green-700 text-white px-4 py-3">
                    <p className="font-semibold">{conferenciaInstNome || "Contrato"}</p>
                    <p className="text-green-100 text-xs mt-0.5">
                      {conferenciaFotoSomenteLeitura
                        ? "Foto já lançada — quantidades bloqueadas"
                        : contarFotosEnviadasNota(selectedNota) > 1
                          ? `Foto ${Math.min(conferenciaFotoIdx, contarFotosEnviadasNota(selectedNota) - 1) + 1} — informe só o que aparece nesta foto`
                          : "Confira a foto ao lado e informe as quantidades entregues"}
                    </p>
                  </div>
                  {conferirErrors.itens && (
                    <p className="text-sm text-red-600 px-4 pt-3">{conferirErrors.itens}</p>
                  )}
                  <div className="overflow-x-auto max-h-[min(50vh,420px)] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50 border-b-2 border-amber-200 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-700">Item</th>
                          <th className="text-center px-4 py-2.5 font-bold text-amber-800 w-40">
                            Quantidade
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {conferenciaItens.map((item, idx) => (
                          <tr
                            key={item.produtoInstituicaoId}
                            className={cn(
                              item.quantidade > 0 ? "bg-green-50/50" : "bg-amber-50/30 hover:bg-amber-50/60"
                            )}
                          >
                            <td className="px-4 py-3 font-medium text-gray-900">{item.produtoNome}</td>
                            <td className="px-4 py-3">
                              <div className="mx-auto w-full max-w-[9rem] text-center">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">
                                  Digite aqui
                                </p>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  disabled={conferenciaFotoSomenteLeitura}
                                  aria-label={`Quantidade de ${item.produtoNome}`}
                                  placeholder="0"
                                  className={qtyInputClassName(
                                    item.quantidade > 0,
                                    cn("w-full", conferenciaFotoSomenteLeitura && "opacity-70 cursor-not-allowed")
                                  )}
                                  value={item.quantidade === 0 ? "" : item.quantidade}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "" || raw === ".") {
                                      updateConferenciaQty(idx, 0);
                                      return;
                                    }
                                    const qty = parseFloat(raw);
                                    if (!Number.isNaN(qty)) updateConferenciaQty(idx, qty);
                                  }}
                                />
                                <p className="text-[10px] font-medium text-gray-600 mt-1">{labelUnidade(item.unidade)}</p>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>Total bruto</span><span>{formatCurrency(conferenciaTotais.bruto)}</span></div>
                    <div className="flex justify-between text-amber-700"><span>Desconto ({conferenciaDescontoPct}%)</span><span>- {formatCurrency(conferenciaTotais.desconto)}</span></div>
                    <div className="flex justify-between font-bold text-green-700 text-base pt-1 border-t border-gray-200"><span>A receber</span><span>{formatCurrency(conferenciaTotais.liquido)}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
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
            {isCooperado && (
              <NotaStatusTimeline status={selectedNota.status} valorLiquido={selectedNota.valorLiquido} />
            )}
            {isCooperado && (selectedNota.status === "conferida" || selectedNota.status === "pago") ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Entrega aprovada · {formatMesReferencia(selectedNota.mesReferencia)}
                </p>
                <p className="text-sm"><strong>Escola:</strong> {getEscolaNotaLabel(selectedNota, data.instituicoes)}</p>
                <p className="text-sm"><strong>Data:</strong> {formatDate(selectedNota.dataEntrega)}</p>
                {selectedNota.valorLiquido > 0 && (
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(selectedNota.valorLiquido)}</p>
                )}
                {selectedNota.status === "pago" && (
                  <p className="text-sm text-emerald-700 font-medium inline-flex items-center gap-1">
                    <CheckCircle size={16} /> Pagamento confirmado
                  </p>
                )}
              </div>
            ) : (
              <>
            {selectedNota.lancamentoDireto && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Lançamento avulso pela cooperativa, sem foto de nota.
              </p>
            )}
            {!isCooperado && (
              <p className="text-sm"><strong>Cooperado:</strong> {getCooperadoNome(data.cooperados, selectedNota.cooperadoId)}</p>
            )}
            <p className="text-sm"><strong>Escola:</strong> {getEscolaNotaLabel(selectedNota, data.instituicoes)}</p>
            <p className="text-sm"><strong>Data:</strong> {formatDate(selectedNota.dataEntrega)}</p>
            {selectedNota.assinaturaRecebedor && (
              <p className="text-sm"><strong>Assinatura:</strong> {selectedNota.assinaturaRecebedor}</p>
            )}
            {!isCooperado && selectedNota.itens.length > 0 && (
              <ul className="text-sm space-y-1 border rounded-lg p-3 bg-gray-50">
                {selectedNota.itens.map((item) => (
                  <li key={item.produtoInstituicaoId} className="flex justify-between gap-2">
                    <span>{item.produtoNome} ({item.quantidade} {labelUnidade(item.unidade)})</span>
                    <span className="font-medium">{formatCurrency(item.valorBruto)}</span>
                  </li>
                ))}
              </ul>
            )}
            {!isCooperado && selectedNota.valorLiquido > 0 && (
              <p className="text-right font-bold text-green-700">{formatCurrency(selectedNota.valorLiquido)}</p>
            )}
              </>
            )}
            {selectedNota.motivoRejeicao && (
              <AlertBanner variant="error" title="Motivo da correção">{selectedNota.motivoRejeicao}</AlertBanner>
            )}
            {getFotosExibicaoNota(selectedNota).length > 0 && (
              <div className={cn("grid gap-2", getFotosExibicaoNota(selectedNota).length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
                {getFotosExibicaoNota(selectedNota).map((foto, i) => (
                  <NotaFotoImg key={i} src={foto} alt={`Pedido ${i + 1}`} className="w-full rounded-xl border" />
                ))}
              </div>
            )}
            {isCooperado && selectedNota.status === "rejeitada" && (
              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={() => { setViewModal(false); openAnexar(selectedNota, { abrirCamera: true }); }}>
                  <RefreshCw size={18} /> Enviar de novo
                </Button>
                <Button className="w-full" variant="danger" onClick={() => setExcluirNotaTarget(selectedNota)}>
                  <Trash2 size={18} /> Excluir entrega
                </Button>
              </div>
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
        title={
          excluirNotaTarget?.status === "rejeitada"
            ? "Excluir entrega devolvida?"
            : "Excluir entrega pendente?"
        }
        message={
          excluirNotaTarget?.status === "rejeitada"
            ? "A entrega com pedido de correção será removida da sua lista e também some para o responsável. Você poderá enviar uma nova foto depois."
            : "A foto será removida da sua lista e também desaparece para o responsável. Esta ação não pode ser desfeita."
        }
        confirmLabel="Sim, excluir"
        variant="danger"
        loading={excluindo}
        onConfirm={() => void handleExcluirPendente()}
      />
    </div>
  );
}
