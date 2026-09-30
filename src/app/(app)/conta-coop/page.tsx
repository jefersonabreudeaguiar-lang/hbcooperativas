"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, startTransition, useDeferredValue } from "react";
import { useSearchParams } from "next/navigation";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { TesoureiroAreaGuard } from "@/components/permissions/TesoureiroAreaGuard";
import { ContaCoopSegmentTabs } from "@/components/hb-credit/ContaCoopSegmentTabs";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppDataSelector } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  fetchCreditDashboard,
  fetchCreditLimites,
  fetchCreditParceiros,
  postCreditLimites,
  postCreditParceiroStatus,
  postPartnerPixChangeAction,
  postUpdatePartnerDiscount,
  fetchPartnerPixChangeRequests,
  fetchCooperadoPinResetRequests,
  resetCooperadoFinancialPin,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { buildCreditosBaseMapCached, calcLimiteFromPercentual } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import type { AuthoritativeCreditBaseErrorPayload } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import type { ContaCoopDashboard, ContaCoopLimiteCooperado, ContaCoopParceiro, ContaCoopCooperadoPinResetRequest, ContaCoopPixChangeRequest } from "@/modules/hb-credit/types";
import { cn, formatMesReferencia } from "@/utils/format";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  gravarHbCreditDashboardPersistido,
  lerHbCreditDashboardPersistido,
} from "@/lib/hb-credit/hbCreditDashboardPersistencia";
import { lerHbCreditLimitesPersistidos, gravarHbCreditLimitesPersistidos } from "@/lib/hb-credit/hbCreditLimitesPersistencia";
import { refreshHbCreditLimitesStaff } from "@/lib/hb-credit/hbCreditLimitesRefresh";
import { mensagemAvisoBaseAuthoritativeLimites } from "@/lib/hb-credit/hbCreditLimitesStaffMessages";
import { ensureHbCreditLabLiberacaoPadrao } from "@/lib/hb-credit/ensureHbCreditLabLiberacaoPadrao";
import {
  HB_CREDIT_LAB_LIBERACAO_PERCENT_DEFAULT,
  isHbCreditLabLiberacaoAutoEnabled,
} from "@/lib/hb-credit/hbCreditLabPolicy";
import { useSyncContaCoopLimiteFromFicha } from "@/hooks/useSyncContaCoopLimiteFromFicha";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";
import { notifyHbCreditLimiteSynced } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";

/** Marcações de performance — dev ou NEXT_PUBLIC_HB_CREDIT_PERF=true */
function contaCoopPerfEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_HB_CREDIT_PERF === "true") return true;
  return process.env.NODE_ENV === "development";
}

function contaCoopPerfStart(label: string): number | null {
  if (!contaCoopPerfEnabled()) return null;
  const t = Date.now();
  console.debug(`[conta-coop] ${label} start`);
  return t;
}

function contaCoopPerfEnd(label: string, startedAt: number | null): void {
  if (startedAt == null || !contaCoopPerfEnabled()) return;
  console.debug(`[conta-coop] ${label} ${Date.now() - startedAt}ms`);
}

/** Acima disso não recalculamos crédito-base síncrono no browser (trava UI). */
const CREDITOS_BASE_SYNC_MAX_COOPERADOS = 25;

const PREVIEW_COLETIVO_ITENS_RENDER = 50;

/** Lista GET /limites — revalidação leve (sem sync-limite). */
const LIMITES_LISTA_STALE_MS = 120_000;

const panelFallback = () => <PageSkeleton compact />;

const ContaCoopLiquidacaoPanel = dynamic(
  () =>
    import("@/components/hb-credit/ContaCoopLiquidacaoPanel").then((m) => ({
      default: m.ContaCoopLiquidacaoPanel,
    })),
  { loading: panelFallback, ssr: false }
);
const ContaCoopFiscalNotesConferenciaPanel = dynamic(
  () =>
    import("@/components/hb-credit/ContaCoopFiscalNotesConferenciaPanel").then((m) => ({
      default: m.ContaCoopFiscalNotesConferenciaPanel,
    })),
  { loading: panelFallback, ssr: false }
);
const ContaCoopEstornosPanel = dynamic(
  () =>
    import("@/components/hb-credit/ContaCoopEstornosPanel").then((m) => ({
      default: m.ContaCoopEstornosPanel,
    })),
  { loading: panelFallback, ssr: false }
);
const ContaCoopDescontosPanel = dynamic(
  () =>
    import("@/components/hb-credit/ContaCoopDescontosPanel").then((m) => ({
      default: m.ContaCoopDescontosPanel,
    })),
  { loading: panelFallback, ssr: false }
);

type PreviewColetivo = {
  ok?: boolean;
  error?: string;
  aviso?: string;
  percentual?: number;
  tetoGlobal?: number;
  tetoGlobalPercent?: number;
  limiteAtualTotal?: number;
  novoLimiteTotal?: number;
  totalApos?: number;
  autoAjusteTetoCents?: number;
  itens?: Array<{
    cooperadoId: string;
    creditoBaseCents: number;
    novoLimiteCents: number;
    ajustadoPorUso?: boolean;
  }>;
};

function percentualHbPersistido(
  dashboard: ContaCoopDashboard | null,
  snap?: ReturnType<typeof lerHbCreditLimitesPersistidos>
): number | null {
  const fromDash =
    dashboard?.teto.liberacaoColetivaPercent ?? dashboard?.teto.tetoGlobalPercent ?? null;
  const fromSnap = snap?.liberacaoColetivaPercent ?? null;
  const p = fromDash ?? fromSnap;
  if (p == null || !Number.isFinite(p) || p <= 0) return null;
  return p;
}

function limitePlaceholderCooperado(cooperadoId: string, cooperativaCnpj: string): ContaCoopLimiteCooperado {
  return {
    id: `sem-conta-${cooperadoId}`,
    cooperativaCnpj,
    cooperadoId,
    limiteLiberadoCents: 0,
    valorUsadoCents: 0,
    valorDisponivelCents: 0,
    bloqueado: false,
    hasFinancialPin: false,
    pinLockedUntil: null,
    cashbackDisponivelCents: 0,
    updatedAt: "",
  };
}

function limiteTemContaHb(limite: ContaCoopLimiteCooperado): boolean {
  return !limite.id.startsWith("sem-conta-");
}

function exibirBadgeSemContaHb(limite: ContaCoopLimiteCooperado, creditoBaseCents: number): boolean {
  if (limiteTemContaHb(limite)) return false;
  if (creditoBaseCents > 0) return false;
  if (limite.limiteLiberadoCents > 0 || limite.valorUsadoCents > 0) return false;
  return true;
}

function mergeLimitesCooperado(
  prev: ContaCoopLimiteCooperado[],
  fresh: ContaCoopLimiteCooperado[],
  cooperadoIdsAtivosOrdem: string[]
): ContaCoopLimiteCooperado[] {
  if (!cooperadoIdsAtivosOrdem.length) {
    return fresh.length ? fresh : prev;
  }
  const ativos = new Set(cooperadoIdsAtivosOrdem);
  const map = new Map<string, ContaCoopLimiteCooperado>();
  for (const l of prev) {
    if (ativos.has(l.cooperadoId)) map.set(l.cooperadoId, l);
  }
  for (const l of fresh) {
    if (ativos.has(l.cooperadoId)) map.set(l.cooperadoId, l);
  }
  return cooperadoIdsAtivosOrdem
    .map((id) => map.get(id))
    .filter((l): l is ContaCoopLimiteCooperado => Boolean(l));
}

function mergeCreditosBaseMaps(
  prev: Record<string, number>,
  fresh: Record<string, number> | undefined,
  cooperadoIdsAtivosOrdem: string[]
): Record<string, number> {
  if (!fresh || !Object.keys(fresh).length) return prev;
  const ativos = new Set(cooperadoIdsAtivosOrdem);
  const next = { ...prev };
  for (const [id, cents] of Object.entries(fresh)) {
    if (ativos.has(id)) next[id] = cents;
  }
  for (const id of Object.keys(next)) {
    if (!ativos.has(id)) delete next[id];
  }
  return next;
}

type Tab = "painel" | "limites" | "mercados" | "descontos" | "conferir_nf" | "liquidar" | "estornos";

export default function ContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate optimistic>
        <TesoureiroAreaGuard>
          <ContaCoopContent />
        </TesoureiroAreaGuard>
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function ContaCoopContent() {
  const { user } = usePermissions();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(() => {
    if (
      initialTab === "conferir_nf" ||
      initialTab === "liquidar" ||
      initialTab === "estornos" ||
      initialTab === "limites" ||
      initialTab === "mercados" ||
      initialTab === "descontos"
    ) {
      return initialTab;
    }
    return "painel";
  });

  const handleTabChange = useCallback((next: Tab) => {
    startTransition(() => setTab(next));
  }, []);
  const [loading, setLoading] = useState(true);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [limitesRefreshing, setLimitesRefreshing] = useState(false);
  const [limitesListaAviso, setLimitesListaAviso] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dashboard, setDashboard] = useState<ContaCoopDashboard | null>(null);
  const [limites, setLimites] = useState<ContaCoopLimiteCooperado[]>([]);
  const limitesRef = useRef(limites);
  limitesRef.current = limites;
  const [parceiros, setParceiros] = useState<ContaCoopParceiro[]>([]);
  const [parceirosLoaded, setParceirosLoaded] = useState(false);
  const [parceirosLoading, setParceirosLoading] = useState(false);
  const [parceirosError, setParceirosError] = useState("");
  const [tetoPercentual, setTetoPercentual] = useState(() =>
    isHbCreditLabLiberacaoAutoEnabled() ? String(HB_CREDIT_LAB_LIBERACAO_PERCENT_DEFAULT) : ""
  );
  const [cooperadoId, setCooperadoId] = useState("");
  const [novoLimiteReais, setNovoLimiteReais] = useState("");
  const [percentualColetivo, setPercentualColetivo] = useState(() =>
    isHbCreditLabLiberacaoAutoEnabled() ? String(HB_CREDIT_LAB_LIBERACAO_PERCENT_DEFAULT) : ""
  );
  const [previewColetivo, setPreviewColetivo] = useState<PreviewColetivo | null>(null);
  const [busy, setBusy] = useState(false);
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const [approveDiscountDrafts, setApproveDiscountDrafts] = useState<Record<string, string>>({});
  const [pixChangeRequests, setPixChangeRequests] = useState<ContaCoopPixChangeRequest[]>([]);
  const [cooperadoPinResetRequests, setCooperadoPinResetRequests] = useState<ContaCoopCooperadoPinResetRequest[]>(
    []
  );

  const cnpjFromData =
    useAppDataSelector((data) => {
      if (!user) return "";
      if (user.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
      const coopId = getUserCooperativaId(user, data);
      const coop = data.cooperativas.find((c) => c.id === coopId);
      return coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";
    }, [user?.id, user?.cooperativaCnpj, user?.cooperativaId]) ?? "";

  const [cnpjResolved, setCnpjResolved] = useState("");
  const [cnpjResolving, setCnpjResolving] = useState(false);

  useEffect(() => {
    if (cnpjFromData.length === 14) {
      setCnpjResolved(cnpjFromData);
      setCnpjResolving(false);
      return;
    }
    if (!user?.cooperativaId) {
      setCnpjResolved("");
      setCnpjResolving(false);
      return;
    }
    if (cnpjResolved.length === 14) return;
    let cancelled = false;
    setCnpjResolving(true);
    void resolveCooperativaCnpj(getData(), user.cooperativaId, user).then((resolved) => {
      if (cancelled) return;
      setCnpjResolved(resolved ?? "");
      setCnpjResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cnpjFromData, cnpjResolved.length, user?.cooperativaId, user?.id, user?.cooperativaCnpj]);

  const cnpj = cnpjFromData.length === 14 ? cnpjFromData : cnpjResolved;

  const cooperadosAtivos = useAppDataSelector((data) => {
    if (!user?.cooperativaId) return [];
    return data.cooperados.filter((c) => c.cooperativaId === user.cooperativaId && c.status === "ativo");
  }, [user?.cooperativaId]) ?? [];

  const cooperadoIdsKey = useMemo(
    () => cooperadosAtivos.map((c) => c.id).join("\u001f"),
    [cooperadosAtivos]
  );

  const cooperadoIdsAtivos = useMemo(() => {
    if (!cooperadoIdsKey) return [];
    return cooperadoIdsKey.split("\u001f").filter(Boolean);
  }, [cooperadoIdsKey]);

  const cooperadoIdsAtivosRef = useRef(cooperadoIdsAtivos);
  cooperadoIdsAtivosRef.current = cooperadoIdsAtivos;

  const cooperadoNome = useCallback(
    (id: string) => cooperadosAtivos.find((c) => c.id === id)?.nomeCompleto ?? id,
    [cooperadosAtivos]
  );

  const [creditosBaseColetivo, setCreditosBaseColetivo] = useState<Record<string, number>>({});
  const creditosBaseContextRef = useRef("");
  const creditosBaseComputeGenRef = useRef(0);
  const limitesListaPendingRef = useRef(false);
  const limitesListaFetchedAtRef = useRef(0);

  const recomputeCreditosBaseLocal = useCallback(
    (opts?: { immediate?: boolean }) => {
      if (!opts?.immediate) return;
      if (!user?.cooperativaId || !cooperadoIdsAtivos.length) {
        creditosBaseComputeGenRef.current += 1;
        startTransition(() => {
          setCreditosBaseColetivo({});
          creditosBaseContextRef.current = "";
          creditosBaseRef.current = {};
        });
        return;
      }

      if (cooperadoIdsAtivos.length > CREDITOS_BASE_SYNC_MAX_COOPERADOS) {
        return;
      }

      const contextKey = `${user.cooperativaId}:${cooperadoIdsKey}`;
      const t0 = contaCoopPerfStart("buildCreditosBaseMapCached");
      const map = buildCreditosBaseMapCached(getData(), cooperadoIdsAtivos, user.cooperativaId);
      contaCoopPerfEnd("buildCreditosBaseMapCached", t0);
      creditosBaseContextRef.current = contextKey;
      creditosBaseRef.current = map;
      startTransition(() => {
        setCreditosBaseColetivo(map);
      });
    },
    [user?.cooperativaId, cooperadoIdsAtivos, cooperadoIdsKey]
  );

  const applyCreditosBaseFromServer = useCallback(
    (map: Record<string, number> | undefined) => {
      if (!map || !Object.keys(map).length) return;
      if (!user?.cooperativaId) return;
      const contextKey = `${user.cooperativaId}:${cooperadoIdsKey}`;
      const ids = cooperadoIdsAtivosRef.current;
      startTransition(() => {
        setCreditosBaseColetivo((prev) => {
          const merged = mergeCreditosBaseMaps(prev, map, ids);
          creditosBaseRef.current = merged;
          creditosBaseContextRef.current = contextKey;
          return merged;
        });
      });
    },
    [user?.cooperativaId, cooperadoIdsKey]
  );

  const creditosBaseRef = useRef(creditosBaseColetivo);
  creditosBaseRef.current = creditosBaseColetivo;

  /** Base vinda do GET /limites (ref) — evita buildCreditosBaseMapCached síncrono na liberação coletiva. */
  const pickCreditosBaseForPost = useCallback((): Record<string, number> | null => {
    const fromServer = creditosBaseRef.current;
    if (Object.keys(fromServer).length > 0) return fromServer;

    if (limitesListaPendingRef.current) {
      setError("Aguarde a atualização dos limites na nuvem.");
      return null;
    }

    const ids = cooperadoIdsAtivosRef.current;
    if (ids.length > CREDITOS_BASE_SYNC_MAX_COOPERADOS) {
      setError(
        "Crédito na ficha ainda não carregou para todos os cooperados. Aguarde alguns segundos e tente de novo."
      );
      return null;
    }

    recomputeCreditosBaseLocal({ immediate: true });
    if (Object.keys(creditosBaseRef.current).length > 0) return creditosBaseRef.current;
    setError("Não foi possível obter o crédito na ficha. Atualize a aba Limites e tente novamente.");
    return null;
  }, [recomputeCreditosBaseLocal]);

  const limitesPorCooperado = useMemo(() => {
    const map = new Map<string, ContaCoopLimiteCooperado>();
    for (const l of limites) map.set(l.cooperadoId, l);
    return map;
  }, [limites]);

  const limitesLinhasCooperados = useMemo(() => {
    if (!cnpj) return [];
    return cooperadosAtivos.map((c) => {
      const existente = limitesPorCooperado.get(c.id);
      if (existente) return existente;
      return limitePlaceholderCooperado(c.id, cnpj);
    });
  }, [cooperadosAtivos, limitesPorCooperado, cnpj]);

  const limitesLinhasRender = useDeferredValue(limitesLinhasCooperados);

  useEffect(() => {
    if (!cooperadoIdsAtivos.length) return;
    setLimites((prev) => mergeLimitesCooperado(prev, [], cooperadoIdsAtivos));
    setCreditosBaseColetivo((prev) => mergeCreditosBaseMaps(prev, prev, cooperadoIdsAtivos));
  }, [cooperadoIdsKey, cooperadoIdsAtivos]);

  const limiteSyncOpts = useMemo(() => {
    if (!user?.cooperativaId || !cooperadoIdsAtivos.length) return undefined;
    return {
      cooperadoId: cooperadoIdsAtivos[0],
      cooperativaId: user.cooperativaId,
      cooperadoIds: cooperadoIdsAtivos,
      user,
      enabled: true as const,
    };
  }, [user, cooperadoIdsAtivos]);

  useSyncContaCoopLimiteFromFicha({
    ...limiteSyncOpts,
    enabled: false,
  });

  const applyLimitesFetchResult = useCallback(
    (
      full: {
        limites: ContaCoopLimiteCooperado[];
        creditosBaseAuthoritativeCents?: Record<string, number>;
        authoritativeError?: AuthoritativeCreditBaseErrorPayload;
      },
      ids: string[]
    ) => {
      if (full.authoritativeError) {
        setLimitesListaAviso(mensagemAvisoBaseAuthoritativeLimites(full.authoritativeError));
        startTransition(() => {
          setCreditosBaseColetivo((prev) => {
            const next = { ...prev };
            for (const id of ids) next[id] = 0;
            creditosBaseRef.current = next;
            return next;
          });
        });
      } else {
        setLimitesListaAviso("");
        applyCreditosBaseFromServer(full.creditosBaseAuthoritativeCents);
      }
      const merged = full.authoritativeError
        ? mergeLimitesCooperado(limitesRef.current, full.limites, ids)
        : mergeLimitesCooperado([], full.limites, ids);
      startTransition(() => {
        setLimites(merged);
      });
      gravarHbCreditLimitesPersistidos(cnpj, merged, full.creditosBaseAuthoritativeCents);
      limitesListaFetchedAtRef.current = Date.now();
    },
    [cnpj, applyCreditosBaseFromServer]
  );

  const syncLimitesComFicha = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!cnpj || !user?.cooperativaId || !cooperadoIdsAtivos.length) return [];
      if (limitesListaPendingRef.current) return [];
      if (!opts?.background) setLimitesRefreshing(true);
      limitesListaPendingRef.current = true;
      const t0 = contaCoopPerfStart("sync-limite+limites");
      try {
        const result = await refreshHbCreditLimitesStaff({
          cnpj,
          cooperativaId: user.cooperativaId,
          cooperadoIds: cooperadoIdsAtivos,
        });
        applyLimitesFetchResult(result, cooperadoIdsAtivos);
        return limitesRef.current;
      } catch (e) {
        setLimitesListaAviso(
          e instanceof Error ? e.message : "Não foi possível sincronizar limites com a ficha."
        );
        return [];
      } finally {
        contaCoopPerfEnd("sync-limite+limites", t0);
        limitesListaPendingRef.current = false;
        setLimitesRefreshing(false);
      }
    },
    [cnpj, cooperadoIdsAtivos, user?.cooperativaId, applyLimitesFetchResult]
  );

  const atualizarLimitesNaNuvem = useCallback(async () => {
    if (!cnpj || !user?.cooperativaId || !cooperadoIdsAtivos.length) return;
    setLimitesListaAviso("");
    limitesListaFetchedAtRef.current = 0;
    await syncLimitesComFicha({ background: false });
  }, [cnpj, user?.cooperativaId, cooperadoIdsAtivos.length, syncLimitesComFicha]);

  const revalidateLimitesLista = useCallback(
    async (opts?: { background?: boolean; force?: boolean }) => {
      if (!cnpj || cnpj.length !== 14) return;
      if (!cooperadoIdsAtivosRef.current.length) return;
      if (limitesListaPendingRef.current) return;
      if (
        !opts?.force &&
        limitesListaFetchedAtRef.current > 0 &&
        Date.now() - limitesListaFetchedAtRef.current < LIMITES_LISTA_STALE_MS
      ) {
        return;
      }
      limitesListaPendingRef.current = true;
      if (!opts?.background) setLimitesRefreshing(true);
      const ids = cooperadoIdsAtivosRef.current;
      const t0 = contaCoopPerfStart("GET /api/credit/limites");
      try {
        const full = await fetchCreditLimites(cnpj, {
          cooperadoIds: ids.length ? ids : undefined,
        });
        applyLimitesFetchResult(full, ids);
      } catch (e) {
        setLimitesListaAviso(
          e instanceof Error ? e.message : "Não foi possível carregar limites da nuvem."
        );
      } finally {
        contaCoopPerfEnd("GET /api/credit/limites", t0);
        limitesListaPendingRef.current = false;
        setLimitesRefreshing(false);
      }
    },
    [cnpj, applyLimitesFetchResult]
  );

  const percentualLiberacaoHb = useMemo(() => {
    const snap = cnpj ? lerHbCreditLimitesPersistidos(cnpj) : null;
    return percentualHbPersistido(dashboard, snap);
  }, [cnpj, dashboard?.teto.liberacaoColetivaPercent, dashboard?.teto.tetoGlobalPercent]);

  const valoresLimiteExibidos = useCallback(
    (limite: ContaCoopLimiteCooperado, _creditoBaseCents: number) => ({
      liberado: limite.limiteLiberadoCents,
      usado: limite.valorUsadoCents,
      disponivel: limite.valorDisponivelCents,
    }),
    []
  );

  const loadParceiros = useCallback(async () => {
    if (!cnpj || cnpj.length !== 14) return;
    setParceirosLoading(true);
    setParceirosError("");
    setParceirosLoaded(false);
    try {
      const parc = await fetchCreditParceiros(cnpj);
      setParceiros(parc);
      setParceirosError("");
      setParceirosLoaded(true);
    } catch {
      setParceirosError("Não foi possível carregar os mercados parceiros.");
      setParceirosLoaded(true);
    } finally {
      setParceirosLoading(false);
    }
  }, [cnpj]);

  const loadPinAndPixRequests = useCallback(async () => {
    if (!cnpj || cnpj.length !== 14) return;
    const [pixReqs, coopPinReqs] = await Promise.all([
      fetchPartnerPixChangeRequests(cnpj, "pendente").catch(() => []),
      fetchCooperadoPinResetRequests(cnpj).catch(() => []),
    ]);
    setPixChangeRequests(pixReqs);
    setCooperadoPinResetRequests(coopPinReqs);
  }, [cnpj]);

  const reload = useCallback(async (opts?: { background?: boolean }) => {
    if (!cnpj) return;
    const background = opts?.background ?? false;
    if (!background) setLoading(true);
    else setDashboardRefreshing(true);
    setError("");
    const t0 = contaCoopPerfStart("POST /api/credit/dashboard");
    try {
      const coopId = user?.cooperativaId ?? "";
      const ids = cooperadoIdsAtivosRef.current;
      const dash = await fetchCreditDashboard(cnpj, creditosBaseRef.current);
      setDashboard(dash);
      if (dash) gravarHbCreditDashboardPersistido(cnpj, dash);
      setLoading(false);

      if (dash && ids.length && coopId) {
        void ensureHbCreditLabLiberacaoPadrao({
          cnpj,
          cooperadoIds: ids,
          creditosBaseCents: creditosBaseRef.current,
          tetoGlobalPercent: dash.teto.tetoGlobalPercent,
          limiteDistribuidoCents: dash.teto.limiteDistribuidoCents,
        }).then((seeded) => {
          if (seeded) void reload({ background: true });
        });
      }
    } catch (e) {
      if (!background) {
        setError(e instanceof Error ? e.message : "Erro ao carregar HB Créditos.");
      }
      setLoading(false);
    } finally {
      contaCoopPerfEnd("POST /api/credit/dashboard", t0);
      setDashboardRefreshing(false);
    }
  }, [cnpj, user?.cooperativaId]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!cnpj) return;
    const snapDash = lerHbCreditDashboardPersistido(cnpj);
    const snapLimites = lerHbCreditLimitesPersistidos(cnpj);
    let background = false;
    if (snapDash?.dashboard) {
      setDashboard(snapDash.dashboard);
      setLoading(false);
      background = true;
    }
    if (snapLimites?.limites.length) {
      setLimites(snapLimites.limites);
      limitesListaFetchedAtRef.current = snapLimites.savedAt
        ? Date.parse(snapLimites.savedAt) || Date.now()
        : Date.now();
    }
    if (snapLimites?.creditosBaseCents && Object.keys(snapLimites.creditosBaseCents).length) {
      setCreditosBaseColetivo(snapLimites.creditosBaseCents);
      creditosBaseRef.current = snapLimites.creditosBaseCents;
    }
    const snapPct = percentualHbPersistido(null, snapLimites);
    if (snapPct != null) {
      const s = String(snapPct);
      setTetoPercentual(s);
      setPercentualColetivo(s);
    }
    void reloadRef.current({ background });
  }, [cnpj]);

  const parceirosTabs: Tab[] = ["mercados", "conferir_nf", "liquidar", "estornos"];
  useEffect(() => {
    if (!cnpj || !parceirosTabs.includes(tab)) return;
    if (parceirosLoaded && !parceirosLoading) return;
    void loadParceiros();
  }, [tab, cnpj, loadParceiros, parceirosLoaded, parceirosLoading]);

  useEffect(() => {
    if (!cnpj) return;
    if (tab !== "painel" && tab !== "mercados") return;
    const cancelIdle = scheduleContaCoopAuxSync(() => void loadPinAndPixRequests(), {
      idleTimeoutMs: 6_000,
      fallbackMs: 14_000,
    });
    return cancelIdle;
  }, [tab, cnpj, loadPinAndPixRequests]);

  /** GET /limites — aba Limites: paint com cache, depois nuvem (sem persist em massa). */
  useEffect(() => {
    if (tab !== "limites") return;
    if (!cnpj) return;
    if (!cooperadoIdsAtivos.length) return;
    let cancelled = false;
    const cancelIdle = scheduleContaCoopAuxSync(
      () => {
        if (cancelled) return;
        void (async () => {
          const ids = cooperadoIdsAtivosRef.current;
          if (!limitesRef.current.length && ids.length) {
            try {
              const fast = await fetchCreditLimites(cnpj, { fast: true, cooperadoIds: ids });
              if (!cancelled && fast.limites.length) {
                startTransition(() => {
                  setLimites((prev) => mergeLimitesCooperado(prev, fast.limites, ids));
                });
              }
            } catch {
              /* mantém cache local */
            }
          }
          if (cancelled) return;
          await revalidateLimitesLista({ background: true });
        })();
      },
      { idleTimeoutMs: 300, fallbackMs: 1_500 }
    );
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [tab, cnpj, cooperadoIdsAtivos.length, revalidateLimitesLista]);

  useEffect(() => {
    if (!cnpj) return;
    const snap = lerHbCreditLimitesPersistidos(cnpj);
    const pref = percentualHbPersistido(dashboard, snap);
    if (pref == null) return;
    const s = String(pref);
    setTetoPercentual(s);
    setPercentualColetivo(s);
  }, [cnpj, dashboard?.teto.liberacaoColetivaPercent, dashboard?.teto.tetoGlobalPercent]);

  const salvarTeto = async () => {
    if (!cnpj) return;
    const creditosBaseCents = pickCreditosBaseForPost();
    if (!creditosBaseCents) return;
    const pct = Number(tetoPercentual.replace(",", "."));
    setBusy(true);
    setError("");
    try {
      await postCreditLimites({
        action: "set_teto",
        cnpj,
        tetoPercentual: pct,
        creditosBaseCents,
      });
      setPercentualColetivo(String(pct));
      gravarHbCreditLimitesPersistidos(cnpj, limitesRef.current, creditosBaseRef.current, pct);
      await reload();
      await syncLimitesComFicha({ background: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar teto.");
    } finally {
      setBusy(false);
    }
  };

  const salvarLimiteIndividual = async () => {
    if (!cnpj || !cooperadoId) return;
    const creditosBaseCents = pickCreditosBaseForPost();
    if (!creditosBaseCents) return;
    setBusy(true);
    setError("");
    try {
      await postCreditLimites({
        action: "set_individual",
        cnpj,
        cooperadoId,
        novoLimiteReais: Number(novoLimiteReais.replace(",", ".")),
        creditosBaseCents,
      });
      await reload();
      await revalidateLimitesLista({ force: true, background: true });
      notifyHbCreditLimiteSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao liberar limite.");
    } finally {
      setBusy(false);
    }
  };

  const previewColetivoAction = async () => {
    if (!cnpj) return;
    const percentual = Number(percentualColetivo.replace(",", "."));
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      setError("Informe um percentual entre 0 e 100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const creditosBaseCents = pickCreditosBaseForPost();
      if (!creditosBaseCents) return;
      const res = await postCreditLimites({
        action: "preview_coletivo",
        cnpj,
        cooperadoIds: cooperadosAtivos.map((c) => c.id),
        percentual,
        creditosBaseCents,
      });
      const preview = (res as { preview?: PreviewColetivo }).preview ?? null;
      startTransition(() => setPreviewColetivo(preview));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na prévia.");
    } finally {
      setBusy(false);
    }
  };

  const salvarColetivo = async () => {
    if (!cnpj) return;
    const percentual = Number(percentualColetivo.replace(",", "."));
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      setError("Informe um percentual entre 0 e 100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const creditosBaseCents = pickCreditosBaseForPost();
      if (!creditosBaseCents) return;
      await postCreditLimites({
        action: "set_coletivo",
        cnpj,
        cooperadoIds: cooperadosAtivos.map((c) => c.id),
        percentual,
        creditosBaseCents,
      });
      setPreviewColetivo(null);
      gravarHbCreditLimitesPersistidos(cnpj, limitesRef.current, creditosBaseRef.current, percentual);
      await reload();
      await revalidateLimitesLista({ force: true, background: true });
      notifyHbCreditLimiteSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao liberar limites.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBloqueio = async (limite: ContaCoopLimiteCooperado) => {
    if (!cnpj) return;
    setBusy(true);
    try {
      await postCreditLimites({
        action: "set_bloqueado",
        cnpj,
        cooperadoId: limite.cooperadoId,
        bloqueado: !limite.bloqueado,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao alterar bloqueio.");
    } finally {
      setBusy(false);
    }
  };

  const atualizarMercado = async (parceiroId: string, status: "ativo" | "bloqueado", partnerDiscountPercent?: number) => {
    if (!cnpj) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await postCreditParceiroStatus(cnpj, parceiroId, status, partnerDiscountPercent);
      await loadParceiros();
      const nome = parceiros.find((p) => p.id === parceiroId)?.nomeMercado ?? "Mercado";
      if (status === "ativo") {
        const pct =
          partnerDiscountPercent != null && Number.isFinite(partnerDiscountPercent)
            ? `${partnerDiscountPercent}%`
            : null;
        setSuccess(
          pct
            ? `${nome} autorizado com desconto contratual de ${pct} nas vendas HB Créditos.`
            : `${nome} autorizado.`
        );
        setApproveDiscountDrafts((prev) => {
          const next = { ...prev };
          delete next[parceiroId];
          return next;
        });
      } else if (status === "bloqueado") {
        setSuccess(`${nome} bloqueado — não poderá cobrar até reativar.`);
      }
      void reload({ background: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar mercado.");
    } finally {
      setBusy(false);
    }
  };

  const salvarDescontoMercado = async (parceiroId: string) => {
    if (!cnpj) return;
    const raw =
      discountDrafts[parceiroId] ??
      approveDiscountDrafts[parceiroId] ??
      String(parceiros.find((p) => p.id === parceiroId)?.partnerDiscountPercent ?? "");
    const percent = Number(raw.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Informe um desconto entre 0 e 100%.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await postUpdatePartnerDiscount(cnpj, parceiroId, percent);
      await loadParceiros();
      const nome = parceiros.find((p) => p.id === parceiroId)?.nomeMercado ?? "Mercado";
      setSuccess(`Desconto de ${percent}% salvo para ${nome}.`);
      setDiscountDrafts((prev) => {
        const next = { ...prev };
        delete next[parceiroId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar desconto.");
    } finally {
      setBusy(false);
    }
  };

  const resetarPinCooperado = async (limite: ContaCoopLimiteCooperado) => {
    if (!cnpj) return;
    const nome = cooperadoNome(limite.cooperadoId);
    const msg =
      `Resetar o PIN de pagamento HB Créditos de "${nome}"?\n\n` +
      "O cooperado precisará cadastrar um PIN novo em Minha Conta Coop antes de pagar nos mercados.";
    if (!window.confirm(msg)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await resetCooperadoFinancialPin(cnpj, limite.cooperadoId);
      setSuccess(`PIN de pagamento resetado para ${nome}. O cooperado deve cadastrar um PIN novo.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao resetar PIN do cooperado.");
    } finally {
      setBusy(false);
    }
  };

  const aprovarMudancaPix = async (solicitacao: ContaCoopPixChangeRequest) => {
    if (!cnpj) return;
    const nome = solicitacao.partnerNome ?? solicitacao.partnerId;
    if (!window.confirm(`Liberar alteração de PIX para "${nome}"?\n\nO mercado poderá cadastrar uma nova chave.`)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await postPartnerPixChangeAction({ cnpj, requestId: solicitacao.id, action: "approve" });
      setSuccess(`Alteração de PIX liberada para ${nome}.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar mudança de PIX.");
    } finally {
      setBusy(false);
    }
  };

  const negarMudancaPix = async (solicitacao: ContaCoopPixChangeRequest) => {
    if (!cnpj) return;
    const nome = solicitacao.partnerNome ?? solicitacao.partnerId;
    const motivo = window.prompt(`Negar mudança de PIX de "${nome}"?\n\nOpcional: informe o motivo para o mercado.`) ?? "";
    if (motivo === null) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await postPartnerPixChangeAction({
        cnpj,
        requestId: solicitacao.id,
        action: "deny",
        reviewNote: motivo.trim() || undefined,
      });
      setSuccess(`Solicitação de PIX negada para ${nome}.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao negar mudança de PIX.");
    } finally {
      setBusy(false);
    }
  };

  const cooperativaNome = useAppDataSelector((data) => {
    if (!user) return "Cooperativa";
    const coopId = getUserCooperativaId(user, data);
    return data.cooperativas.find((c) => c.id === coopId)?.nome ?? "Cooperativa";
  }, [user?.id, user?.cooperativaId]) ?? "Cooperativa";

  const statusMercadoLabel = (status: string) => {
    if (status === "ativo") return "Ativo";
    if (status === "pendente") return "Aguardando aprovação";
    if (status === "bloqueado") return "Bloqueado";
    return status;
  };

  const pinCooperadoBloqueado = (limite: ContaCoopLimiteCooperado) =>
    Boolean(limite.pinLockedUntil && new Date(limite.pinLockedUntil).getTime() > Date.now());

  if (cnpjResolving && !cnpj) return <PageSkeleton />;

  if (!cnpj) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-8">
        <AlertBanner variant="warning" title="Cooperativa não identificada">
          Não foi possível obter o CNPJ da cooperativa para carregar a HB Créditos. Aguarde a sincronização na nuvem
          ou atualize a página.
        </AlertBanner>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Atualizar página
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-700">HB Créditos</p>
        <h1 className="text-2xl font-bold text-gray-900">Gestão do crédito interno</h1>
        <p className="text-sm text-gray-500">Libere limites, acompanhe uso e gerencie mercados parceiros</p>
      </header>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && (
        <AlertBanner variant="success" title="Pronto" onDismiss={() => setSuccess("")}>
          {success}
        </AlertBanner>
      )}


      <ContaCoopSegmentTabs
        tabs={[
          { id: "painel", label: "Visão geral" },
          { id: "limites", label: "Limites" },
          { id: "mercados", label: "Mercados" },
          { id: "descontos", label: "Descontos" },
          { id: "conferir_nf", label: "Conferir NFs" },
          { id: "liquidar", label: "Liquidar" },
          { id: "estornos", label: "Estornos" },
        ]}
        active={tab}
        onChange={handleTabChange}
      />

      {tab === "painel" && (
        <>
          {loading && !dashboard ? (
            <PageSkeleton compact />
          ) : dashboard ? (
        <div className="space-y-4">
          {dashboardRefreshing && (
            <p className="text-xs text-gray-500">Atualizando painel com a nuvem…</p>
          )}
          {cooperadoPinResetRequests.length > 0 && (
            <AlertBanner variant="info" title="Cooperados pediram reset do PIN de pagamento">
              <p className="text-sm">
                <strong>{cooperadoPinResetRequests.length}</strong> cooperado(s) aguardando reset do PIN de pagamento
                HB Créditos. Confirme na aba <strong>Limites</strong>.
              </p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => handleTabChange("limites")}>
                Ver limites
              </Button>
            </AlertBanner>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Disponível (todos)"
              value={formatCentsBRL(dashboard.agregadoCooperados.valorDisponivelCents)}
              subtitle={`Usado ${formatCentsBRL(dashboard.agregadoCooperados.valorUsadoCents)}`}
              variant="success"
            />
            <StatCard
              title="Crédito liberado"
              value={formatCentsBRL(dashboard.agregadoCooperados.limiteLiberadoCents)}
              variant="default"
            />
            <StatCard
              title="Ainda pode liberar"
              value={formatCentsBRL(dashboard.teto.restanteParaLiberarCents)}
              subtitle={`Teto ${dashboard.teto.tetoGlobalPercent}%`}
              variant="gold"
            />
            <StatCard
              title="Atividade (7 dias)"
              value={String(dashboard.transacoesRecentes)}
              subtitle={`${dashboard.parceirosPendentes} mercado(s) pendente(s)`}
              variant="default"
            />
          </div>

          <div className="space-y-2">
            <div>
              <h3 className="font-semibold text-gray-900">
                Lançamentos — {formatMesReferencia(dashboard.lancamentosMes.mesReferencia)}
              </h3>
              <p className="text-sm text-gray-600">
                Valores calculados a partir das transações confirmadas no banco (compras, estornos e recebíveis).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Compras (bruto)"
                value={formatCentsBRL(dashboard.lancamentosMes.comprasBrutoCents)}
                subtitle={`${dashboard.lancamentosMes.comprasQtd} pagamento(s)`}
                variant="default"
              />
              <StatCard
                title="Estornos"
                value={formatCentsBRL(dashboard.lancamentosMes.estornosCents)}
                subtitle={`${dashboard.lancamentosMes.estornosQtd} estorno(s)`}
                variant="default"
              />
              <StatCard
                title="Desconto mercados"
                value={formatCentsBRL(dashboard.lancamentosMes.descontoMercadosCents)}
                subtitle={`Líquido mercados ${formatCentsBRL(dashboard.lancamentosMes.liquidoMercadosCents)}`}
                variant="gold"
              />
              <StatCard
                title="Crédito debitado"
                value={formatCentsBRL(dashboard.lancamentosMes.creditoDebitadoCents)}
                subtitle={`Cashback saldo ${formatCentsBRL(dashboard.lancamentosMes.cashbackSaldoCooperadosCents)}`}
                variant="success"
              />
            </div>
            <StatCard
              title="A receber mercados (aberto)"
              value={formatCentsBRL(dashboard.lancamentosMes.recebivelMercadosAbertoCents)}
              subtitle="Recebíveis em aberto, elegíveis ou em processamento"
              variant="default"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-4 !p-5">
              <div>
                <h3 className="font-semibold text-gray-900">Teto da cooperativa</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Limite máximo que a cooperativa pode distribuir entre cooperados, com base no valor a receber
                  pendente na ficha (mesmo total exibido ao cooperado).
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1">
                <p>
                  <span className="text-gray-500">Percentual de compra (liberação):</span>{" "}
                  <strong>
                    {dashboard.teto.liberacaoColetivaPercent ?? dashboard.teto.tetoGlobalPercent}%
                  </strong>
                </p>
                <p>
                  <span className="text-gray-500">Teto máximo cooperativa:</span>{" "}
                  <strong>
                    {dashboard.teto.tetoGlobalPercent}% = {formatCentsBRL(dashboard.teto.tetoGlobalCents)}
                  </strong>
                </p>
                <p>
                  <span className="text-gray-500">Base HB (a receber pendente):</span>{" "}
                  {formatCentsBRL(dashboard.teto.creditoBaseTotalCents)}
                </p>
                <p>
                  <span className="text-gray-500">Já distribuído:</span>{" "}
                  {formatCentsBRL(dashboard.teto.limiteDistribuidoCents)}
                </p>
                <p className="text-xs text-gray-500 pt-1">
                  Para alterar o percentual de compra, use a aba <strong>Limites</strong>.
                </p>
              </div>
            </Card>

            <Card className="space-y-3 !p-5">
              <h3 className="font-semibold text-gray-900">Como funciona</h3>
              <ol className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">
                    1
                  </span>
                  <span>Defina o percentual de compra na aba Limites e libere crédito para os cooperados</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">
                    2
                  </span>
                  <span>Cooperado paga nos mercados parceiros com QR Code</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">
                    3
                  </span>
                  <span>A cooperativa recebe e liquida os recebíveis depois</span>
                </li>
              </ol>
            </Card>
          </div>
        </div>
          ) : null}
        </>
      )}

      {tab === "limites" && (
        <div className="space-y-6">
          {limitesListaAviso ? (
            <AlertBanner variant="warning" title="Limites desatualizados">
              {limitesListaAviso}
            </AlertBanner>
          ) : null}
          {limitesRefreshing && (
            <p className="text-xs text-gray-500">Atualizando valores na nuvem…</p>
          )}

          <Card className="space-y-4 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">Percentual de compra HB</h3>
              <p className="text-sm text-gray-600">
                Salvo na nuvem — usado na liberação coletiva e na sincronização automática dos limites com a ficha.
                Só precisa informar de novo se quiser alterar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label htmlFor="percentual-compra-hb">Percentual (%)</Label>
                <Input
                  id="percentual-compra-hb"
                  value={tetoPercentual}
                  onChange={(e) => {
                    setTetoPercentual(e.target.value);
                    setPercentualColetivo(e.target.value);
                  }}
                  className="w-40"
                  placeholder={
                    dashboard?.teto.liberacaoColetivaPercent != null
                      ? String(dashboard.teto.liberacaoColetivaPercent)
                      : "50"
                  }
                  inputMode="decimal"
                />
              </div>
              <Button onClick={salvarTeto} disabled={busy}>
                Salvar percentual
              </Button>
            </div>
            {dashboard && (
              <p className="text-xs text-gray-500">
                Atual na nuvem: liberação {dashboard.teto.liberacaoColetivaPercent}% · teto máximo{" "}
                {dashboard.teto.tetoGlobalPercent}%
              </p>
            )}
          </Card>

          <AlertBanner variant="info">
            Se o cooperado esquecer o PIN de pagamento, ele pode solicitar reset em Minha Conta Coop. Você confirma
            aqui em <strong>Resetar PIN de pagamento</strong>; depois ele cadastra um PIN novo.
          </AlertBanner>

          {cooperadoPinResetRequests.length > 0 && (
            <Card className="space-y-3 border-cyan-300 bg-cyan-50/60 !p-4">
              <h3 className="font-semibold text-gray-900">Solicitações de reset de PIN (pagamento)</h3>
              <p className="text-sm text-gray-600">
                Cooperados pediram reset do PIN de pagamento HB Créditos para cadastrar um novo.
              </p>
              {cooperadoPinResetRequests.map((req) => {
                const limite = limitesPorCooperado.get(req.cooperadoId);
                if (!limite || !limiteTemContaHb(limite)) return null;
                return (
                  <div key={req.id} className="rounded-xl border border-cyan-200 bg-white p-4">
                    <p className="font-semibold text-gray-900">{cooperadoNome(req.cooperadoId)}</p>
                    <p className="text-xs text-gray-500">
                      Solicitado em {new Date(req.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <div className="mt-3">
                      <Button size="sm" onClick={() => void resetarPinCooperado(limite)} disabled={busy}>
                        Resetar PIN de pagamento
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          <Card className="overflow-hidden !p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p>
                <strong className="text-gray-900">Crédito (ficha)</strong> = valor a receber em aberto na nuvem
                (operacional + notas), mesma base do painel HB e da tela do cooperado após sync.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy || limitesRefreshing}
                onClick={() => void atualizarLimitesNaNuvem()}
              >
                Atualizar limites
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-3">Cooperado</th>
                    <th className="p-3">Crédito (ficha)</th>
                    <th className="p-3">Liberado</th>
                    <th className="p-3">Usado</th>
                    <th className="p-3">Disponível</th>
                    <th className="p-3">PIN pagamento</th>
                    <th className="p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {limitesLinhasRender.map((l) => {
                    const baseCents = creditosBaseColetivo[l.cooperadoId] ?? 0;
                    const exib = valoresLimiteExibidos(l, baseCents);
                    return (
                    <tr key={l.cooperadoId} className="border-t">
                      <td className="p-3">
                        {cooperadoNome(l.cooperadoId)}
                        {exibirBadgeSemContaHb(l, baseCents) && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            Sem conta HB
                          </span>
                        )}
                        {l.bloqueado && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            Bloqueado
                          </span>
                        )}
                      </td>
                      <td className="p-3">{formatCentsBRL(baseCents)}</td>
                      <td className="p-3">{formatCentsBRL(exib.liberado)}</td>
                      <td className="p-3">{formatCentsBRL(exib.usado)}</td>
                      <td className="p-3 font-medium text-green-800">
                        {formatCentsBRL(exib.disponivel)}
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {!limiteTemContaHb(l)
                          ? "—"
                          : l.hasFinancialPin
                            ? pinCooperadoBloqueado(l)
                              ? "Bloqueado"
                              : "Cadastrado"
                            : "Não cadastrado"}
                      </td>
                      <td className="p-3">
                        {limiteTemContaHb(l) ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => toggleBloqueio(l)} disabled={busy}>
                              {l.bloqueado ? "Desbloquear" : "Bloquear"}
                            </Button>
                            {(l.hasFinancialPin || pinCooperadoBloqueado(l)) && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void resetarPinCooperado(l)}
                                disabled={busy}
                              >
                                Resetar PIN
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Libere via coletivo</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {!limitesLinhasRender.length && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-500">
                        Nenhum cooperado ativo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="space-y-4 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">Liberação individual</h3>
              <p className="text-sm text-gray-600">Ajuste o limite de um cooperado específico.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Cooperado</Label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={cooperadoId}
                  onChange={(e) => setCooperadoId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {cooperadosAtivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Novo limite (R$)</Label>
                <Input value={novoLimiteReais} onChange={(e) => setNovoLimiteReais(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={salvarLimiteIndividual} disabled={busy || !cooperadoId}>Salvar</Button>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">
                Liberação coletiva · {cooperadosAtivos.length} cooperados
              </h3>
              <p className="text-sm text-gray-600">
                Aplica o percentual salvo acima para todos de uma vez. Use Prévia antes de confirmar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label>Percentual (mesmo valor salvo acima)</Label>
                <Input
                  value={percentualColetivo}
                  onChange={(e) => {
                    setPercentualColetivo(e.target.value);
                    setTetoPercentual(e.target.value);
                  }}
                  className="w-40"
                  placeholder="50"
                  inputMode="decimal"
                />
              </div>
              <Button variant="secondary" onClick={previewColetivoAction} disabled={busy}>Prévia</Button>
              <Button onClick={salvarColetivo} disabled={busy}>Liberar todos</Button>
            </div>
            {previewColetivo && (
              <div className="text-sm bg-gray-50 border rounded-lg p-3 space-y-3">
                <div className="space-y-1">
                  <p>Percentual: {previewColetivo.percentual ?? percentualColetivo}%</p>
                  <p>
                    Teto global: {previewColetivo.tetoGlobalPercent ?? dashboard?.teto.tetoGlobalPercent ?? 100}% ={" "}
                    {formatCentsBRL(Number(previewColetivo.tetoGlobal ?? 0))}
                  </p>
                  <p>Limite atual total: {formatCentsBRL(Number(previewColetivo.limiteAtualTotal ?? 0))}</p>
                  <p>Novo pacote: {formatCentsBRL(Number(previewColetivo.novoLimiteTotal ?? 0))}</p>
                  <p className="font-medium">Total após: {formatCentsBRL(Number(previewColetivo.totalApos ?? 0))}</p>
                  {!previewColetivo.ok && (
                    <p className="text-red-600">{String(previewColetivo.error ?? "Ultrapassa teto")}</p>
                  )}
                  {previewColetivo.ok && previewColetivo.aviso && (
                    <p className="text-amber-800">{previewColetivo.aviso}</p>
                  )}
                </div>
                {!!previewColetivo.itens?.length && (
                  <div className="overflow-x-auto border rounded-lg bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="p-2">Cooperado</th>
                          <th className="p-2">Crédito (ficha)</th>
                          <th className="p-2">Novo limite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewColetivo.itens.slice(0, PREVIEW_COLETIVO_ITENS_RENDER).map((item) => (
                          <tr key={item.cooperadoId} className="border-t">
                            <td className="p-2">{cooperadoNome(item.cooperadoId)}</td>
                            <td className="p-2">{formatCentsBRL(item.creditoBaseCents)}</td>
                            <td className="p-2">
                              {formatCentsBRL(item.novoLimiteCents)}
                              {item.ajustadoPorUso && (
                                <span className="block text-amber-700">Mínimo = já usado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewColetivo.itens.length > PREVIEW_COLETIVO_ITENS_RENDER && (
                      <p className="p-2 text-xs text-gray-500 border-t">
                        Mostrando {PREVIEW_COLETIVO_ITENS_RENDER} de {previewColetivo.itens.length} cooperados na
                        prévia.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "conferir_nf" && (
        <div>
          <ContaCoopFiscalNotesConferenciaPanel
            cnpj={cnpj}
            parceiros={parceiros}
            cooperadoNome={cooperadoNome}
            responsavelNome={user?.name ?? "Responsável"}
          />
        </div>
      )}

      {tab === "liquidar" && (
        <div>
          <ContaCoopLiquidacaoPanel
            cnpj={cnpj}
            cooperativaNome={cooperativaNome}
            parceiros={parceiros}
            cooperadoNome={cooperadoNome}
          />
        </div>
      )}

      {tab === "estornos" && (
        <div>
          <ContaCoopEstornosPanel
            cnpj={cnpj}
            cooperativaId={user?.cooperativaId ?? ""}
            parceiros={parceiros}
            cooperadoNome={cooperadoNome}
          />
        </div>
      )}

      {tab === "descontos" && (
        <div>
          <ContaCoopDescontosPanel cnpj={cnpj} cooperadoNome={cooperadoNome} />
        </div>
      )}

      {tab === "mercados" && (
        <div className="space-y-4">
          {pixChangeRequests.length > 0 && (
            <Card className="space-y-3 border-amber-300 bg-amber-50/60 !p-4">
              <h3 className="font-semibold text-gray-900">Solicitações de mudança de PIX</h3>
              <p className="text-sm text-gray-600">
                Mercados pediram autorização para alterar a chave de recebimento da liquidação HB Créditos.
              </p>
              {pixChangeRequests.map((req) => (
                <div key={req.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <p className="font-semibold text-gray-900">{req.partnerNome ?? req.partnerId}</p>
                  <p className="text-xs text-gray-500">
                    Solicitado em {new Date(req.createdAt).toLocaleString("pt-BR")}
                  </p>
                  {req.motivo && <p className="mt-2 text-sm text-gray-700">Motivo: {req.motivo}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void aprovarMudancaPix(req)} disabled={busy}>
                      Aprovar mudança
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void negarMudancaPix(req)} disabled={busy}>
                      Negar
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {!parceirosLoaded || parceirosLoading ? (
            <Card className="!p-8 text-center text-sm text-gray-500">Carregando mercados parceiros…</Card>
          ) : parceirosError ? (
            <Card className="space-y-4 !p-6">
              <AlertBanner variant="error" title="Mercados parceiros">
                {parceirosError}
              </AlertBanner>
              <Button onClick={() => void loadParceiros()} disabled={parceirosLoading}>
                Recarregar mercados
              </Button>
            </Card>
          ) : (
            <>
          <Card className="border-green-200 bg-green-50/50 !p-4">
            <h3 className="font-semibold text-gray-900">Desconto por contrato com cada mercado</h3>
            <p className="mt-1 text-sm text-gray-600">
              Informe o percentual de desconto acordado com o mercado parceiro. O cooperado paga o valor integral da
              compra; na liquidação o mercado recebe o líquido e a diferença retorna à cooperativa (aba Descontos).
            </p>
          </Card>

          {parceiros.map((p) => {
            const descontoValor =
              discountDrafts[p.id] ??
              approveDiscountDrafts[p.id] ??
              (p.partnerDiscountPercent != null ? String(p.partnerDiscountPercent) : "");

            return (
              <Card key={p.id} className="space-y-4 !p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{p.nomeMercado}</p>
                    <p className="font-mono text-xs text-gray-500">{p.cnpjMercado}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      p.status === "ativo" && "bg-green-100 text-green-800",
                      p.status === "pendente" && "bg-amber-100 text-amber-800",
                      p.status === "bloqueado" && "bg-red-100 text-red-800"
                    )}
                  >
                    {statusMercadoLabel(p.status)}
                  </span>
                </div>

                <div className="rounded-xl border-2 border-green-300 bg-green-50/80 p-4">
                  <p className="text-sm font-medium text-green-900">Desconto contratual (%)</p>
                  <p className="mt-0.5 text-xs text-green-800">
                    {p.status === "pendente"
                      ? "Obrigatório ao aprovar o mercado — percentual que o estabelecimento concede nas vendas HB Créditos."
                      : "Percentual vigente neste contrato. Altere e clique em Salvar desconto."}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Input
                      inputMode="decimal"
                      placeholder="Ex: 5"
                      value={descontoValor}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (p.status === "pendente") {
                          setApproveDiscountDrafts((prev) => ({ ...prev, [p.id]: v }));
                        } else {
                          setDiscountDrafts((prev) => ({ ...prev, [p.id]: v }));
                        }
                      }}
                      className="max-w-xs bg-white text-lg font-semibold"
                    />
                    {p.status === "pendente" ? (
                      <Button
                        onClick={() =>
                          atualizarMercado(
                            p.id,
                            "ativo",
                            Number((descontoValor || "0").replace(",", "."))
                          )
                        }
                        disabled={busy || descontoValor.trim() === ""}
                      >
                        Aprovar mercado com este desconto
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => salvarDescontoMercado(p.id)} disabled={busy}>
                        Salvar desconto
                      </Button>
                    )}
                  </div>
                  {p.status === "ativo" && (p.partnerDiscountPercent ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-green-800">
                      Vigente no sistema: <strong>{p.partnerDiscountPercent}%</strong>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {p.status === "ativo" && (
                    <Button size="sm" variant="secondary" onClick={() => atualizarMercado(p.id, "bloqueado")} disabled={busy}>
                      Bloquear mercado
                    </Button>
                  )}
                  {p.status === "bloqueado" && (
                    <Button size="sm" onClick={() => atualizarMercado(p.id, "ativo")} disabled={busy}>
                      Reativar mercado
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
          {!parceiros.length && (
            <Card className="!p-8 text-center text-sm text-gray-500">Nenhum mercado parceiro cadastrado.</Card>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
