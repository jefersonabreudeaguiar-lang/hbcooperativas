"use client";

import { normalizeUserRole } from "@/permissions";
import type { AppData, AuditAction, User, Cooperado, Cooperativa, PrestacaoContas, UserRole } from "@/types";
import { emptyInitialData, DEMO_ENTITY_IDS, DEMO_EMAILS, DEMO_CNPJ } from "@/mock/data";
import { findCooperativaByCnpj, getCooperativaById, getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { migrateInlinePhotosToIdb } from "@/services/localMediaMigration";
import { compactarFotosNoArmazenamento, liberarEspacoArmazenamento, stripBinaryForPersist } from "@/utils/fotoEntrega";
import { ensureMensalidadesDoMes, ensureMensalidadeCooperado, sincronizarMensalidadeCooperativa } from "@/services/mensalidadeService";
import { applyOperationalResetIfNeeded, clearOperationalData } from "@/services/operationalReset";
import { normalizeCreatorEmail } from "@/lib/security/appCreator";
import {
  CREATOR_ADMIN_EMAIL,
  CREATOR_ADMIN_PASSWORD,
  ensureCreatorAdminAccount,
} from "@/services/creatorAdminPasswordReset";
import {
  fetchCooperativaByCnpjFromCloud,
  mergeCooperativaIntoData,
  registerCooperativaInCloud,
  syncCooperativaToCloud,
  verifyCadastroSenhaCooperado,
} from "@/services/cooperativaCloudService";
import {
  pushCooperadoToCloud,
  queueCooperadoPush,
  syncCooperadosFromCloud,
  ensureCooperativaLocalForCnpj,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { reconciliarFichaFromNotasConferidas, ajustesFichaMesId } from "@/services/notaPedidoService";
import { normalizarPrestacaoContas, aplicarPrestacoesContasExcluidas } from "@/services/prestacaoContasService";
import { aplicarInstituicoesExcluidas } from "@/services/instituicaoContratoService";
import { exigeSenhaCadastroCooperado } from "@/utils/cooperativaCadastro";
import { defaultCobrancaSaas, sincronizarCicloCobrancaSaas } from "@/services/cobrancaSaasService";
import { hashPassword, isPasswordHash, verifyPassword, verifyPasswordSync } from "@/lib/security/password";
import {
  clearAccessToken,
  clearCloudBootstrapCredentials,
  establishCloudSession,
  loginViaCloudApi,
  logoutCloudSession,
  registerCloudUser,
  setActiveCloudProfile,
  userToCloudProfile,
  type CloudSessionProfile,
} from "@/lib/security/clientSession";

const STORAGE_KEY = "coopeagriplla_data";
const SESSION_KEY = "coopeagriplla_session";
const DEMO_PURGED_KEY = "coopeagriplla_demo_purged";

type Listener = () => void;
const listeners = new Set<Listener>();
let memoryCache: AppData | null = null;
let storageListenerAttached = false;
let lastPersistedSerialized: string | null = null;
let notifyFlushScheduled = false;
let automaticTasksScheduled = false;
let saveBatchDepth = 0;
let saveBatchPending: AppData | null = null;
let dataRevision = 0;
let dataWarmScheduled = false;
let dataWarmInFlight = false;

export function getDataRevision(): number {
  return dataRevision;
}

/** true após localStorage ter sido lido (evita UI/sync com shell vazio). */
export function isAppDataWarm(): boolean {
  return memoryCache !== null;
}

function bumpRevision(): void {
  dataRevision++;
}

function invalidateCache(): void {
  memoryCache = null;
  lastPersistedSerialized = null;
  dataWarmScheduled = false;
}

function notify(): void {
  if (notifyFlushScheduled) return;
  notifyFlushScheduled = true;
  queueMicrotask(() => {
    notifyFlushScheduled = false;
    bumpRevision();
    listeners.forEach((l) => l());
  });
}

/** Atualização instantânea da UI — sem esperar microtask nem disco. */
function notifyImmediate(): void {
  bumpRevision();
  notifyFlushScheduled = false;
  listeners.forEach((l) => l());
}

function attachStorageListener(): void {
  if (typeof window === "undefined" || storageListenerAttached) return;
  storageListenerAttached = true;
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === DEMO_PURGED_KEY) {
      invalidateCache();
      notify();
    }
  });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Agrupa várias gravações do sync em uma só (evita travar o celular). */
export function beginSaveBatch(): void {
  saveBatchDepth++;
}

export function endSaveBatch(): void {
  if (saveBatchDepth <= 0) return;
  saveBatchDepth--;
  if (saveBatchDepth === 0 && saveBatchPending) {
    const pending = saveBatchPending;
    saveBatchPending = null;
    persistDataToStorage(pending, { skipNotify: true });
  }
}

export async function runWithBatchedSaveAsync(fn: () => Promise<void>): Promise<void> {
  beginSaveBatch();
  try {
    await fn();
  } finally {
    endSaveBatch();
  }
}

function persistDataToStorage(
  data: AppData,
  options?: { skipNotify?: boolean }
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: true };

  const stripped = stripBinaryForPersist(data);
  const previousCache = memoryCache;
  const candidates = [
    stripped,
    liberarEspacoArmazenamento(stripped, 1),
    liberarEspacoArmazenamento(stripped, 2),
  ];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const serialized = JSON.stringify(candidate);
      if (serialized === lastPersistedSerialized) {
        memoryCache = candidate;
        if (!options?.skipNotify) notify();
        return { ok: true };
      }
      localStorage.setItem(STORAGE_KEY, serialized);
      lastPersistedSerialized = serialized;
      memoryCache = candidate;
      if (!options?.skipNotify) notify();
      return { ok: true };
    } catch (e) {
      if (!isStorageQuotaError(e)) {
        memoryCache = previousCache ?? memoryCache;
        return { ok: false, error: "Não foi possível salvar os dados. Tente novamente." };
      }
    }
  }

  memoryCache = previousCache ?? memoryCache;
  return {
    ok: false,
    error:
      "Memória do navegador cheia. Envie a entrega agora (com internet) ou remova fotos antigas antes de anexar mais.",
  };
}

function stripDemoData(data: AppData): AppData {
  const cooperativas = data.cooperativas.filter(
    (c) => !DEMO_ENTITY_IDS.has(c.id) && normalizeCnpj(c.cnpj) !== DEMO_CNPJ
  );
  const coopIds = new Set(cooperativas.map((c) => c.id));
  const cooperados = data.cooperados.filter(
    (c) => !DEMO_ENTITY_IDS.has(c.id) && (!c.cooperativaId || coopIds.has(c.cooperativaId))
  );
  const cooperadoIds = new Set(cooperados.map((c) => c.id));
  for (const n of data.notasPedido ?? []) {
    if (n.cooperadoId) cooperadoIds.add(n.cooperadoId);
  }
  for (const f of data.fichaCorrida ?? []) {
    if (f.cooperadoId) cooperadoIds.add(f.cooperadoId);
  }
  for (const a of data.arquivosMensais ?? []) {
    if (a.cooperadoId) cooperadoIds.add(a.cooperadoId);
  }
  for (const p of data.pagamentosCooperado ?? []) {
    if (p.cooperadoId) cooperadoIds.add(p.cooperadoId);
  }
  for (const m of data.mensalidades ?? []) {
    if (m.cooperadoId) cooperadoIds.add(m.cooperadoId);
  }
  const users = data.users.filter(
    (u) => !DEMO_ENTITY_IDS.has(u.id) && !DEMO_EMAILS.has(u.email.toLowerCase())
  );

  const filterByCoop = <T extends { id: string; cooperativaId?: string }>(items: T[]) =>
    items.filter((i) => !DEMO_ENTITY_IDS.has(i.id) && (!i.cooperativaId || coopIds.has(i.cooperativaId)));

  const filterByCooperado = <T extends { id: string; cooperadoId?: string }>(items: T[]) =>
    items.filter((i) => !DEMO_ENTITY_IDS.has(i.id) && (!i.cooperadoId || cooperadoIds.has(i.cooperadoId)));

  return {
    ...data,
    cooperativas,
    users,
    cooperados,
    instituicoes: filterByCoop(data.instituicoes ?? []),
    produtosInstituicao: filterByCoop(data.produtosInstituicao ?? []),
    cronogramasContrato: filterByCoop(data.cronogramasContrato ?? []),
    notasPedido: filterByCooperado(data.notasPedido ?? []),
    fichaCorrida: filterByCooperado(data.fichaCorrida ?? []),
    mensalidades: filterByCooperado(data.mensalidades ?? []),
    cotas: filterByCooperado(data.cotas ?? []),
    entregas: (data.entregas ?? []).filter(
      (e) => !DEMO_ENTITY_IDS.has(e.id) && cooperadoIds.has(e.cooperadoId)
    ),
    descontos: filterByCooperado(data.descontos ?? []),
    valoresAvulsosReceber: filterByCooperado(data.valoresAvulsosReceber ?? []).filter(
      (v) => !v.cooperativaId || coopIds.has(v.cooperativaId)
    ),
    pagamentos: filterByCooperado(data.pagamentos ?? []),
    financeiro: (data.financeiro ?? []).filter((f) => !DEMO_ENTITY_IDS.has(f.id)),
    comunicados: (data.comunicados ?? []).filter((c) => !DEMO_ENTITY_IDS.has(c.id)),
    propriedades: filterByCooperado(data.propriedades ?? []),
    veiculos: filterByCooperado(data.veiculos ?? []),
    fechamentos: (data.fechamentos ?? []).filter((f) => !DEMO_ENTITY_IDS.has(f.id)),
    livroCaixa: filterByCoop(data.livroCaixa ?? []),
    prestacoesContas: filterByCoop(data.prestacoesContas ?? []),
    prestacoesContasExcluidas: filterByCoop(data.prestacoesContasExcluidas ?? []),
    instituicoesExcluidas: filterByCoop(data.instituicoesExcluidas ?? []),
    auditLog: (data.auditLog ?? []).filter((a) => !DEMO_ENTITY_IDS.has(a.id)),
    ajustesFichaMes: (data.ajustesFichaMes ?? []).filter(
      (a) => !DEMO_ENTITY_IDS.has(a.id) && coopIds.has(a.cooperativaId)
    ),
  };
}

function migrateAjustesFichaMes(data: AppData): AppData {
  const existing = data.ajustesFichaMes ?? [];
  if (existing.length > 0) return { ...data, ajustesFichaMes: existing };

  const byKey = new Map<string, (typeof existing)[number]>();
  for (const a of data.arquivosMensais ?? []) {
    if (!a.cooperativaId) continue;
    if (a.mensalidadeFixa == null && a.descontoAvulso == null && !a.descontoAvulsoMotivo?.trim()) continue;
    const id = ajustesFichaMesId(a.cooperativaId, a.mesReferencia);
    const prev = byKey.get(id);
    if (!prev || new Date(a.updatedAt).getTime() > new Date(prev.updatedAt).getTime()) {
      byKey.set(id, {
        id,
        cooperativaId: a.cooperativaId,
        mesReferencia: a.mesReferencia,
        mensalidadeFixa: a.mensalidadeFixa ?? 0,
        descontoAvulso: a.descontoAvulso ?? 0,
        descontoAvulsoMotivo: a.descontoAvulsoMotivo,
        updatedAt: a.updatedAt,
      });
    }
  }

  return { ...data, ajustesFichaMes: [...existing, ...byKey.values()] };
}

function migrateData(raw: Partial<AppData> & Record<string, unknown>): AppData {
  const base = { ...emptyInitialData, ...raw } as AppData;
  const cooperativas = (base.cooperativas ?? []).map((c) => ({
    ...c,
    cnpj: normalizeCnpj(c.cnpj),
    status: c.status ?? "ativa",
  }));
  const cooperados = (base.cooperados ?? []).map((c) => ({
    ...c,
    cooperativaId: c.cooperativaId ?? cooperativas[0]?.id ?? "",
    pixValido: c.chavePix?.trim() ? (c.pixValido ?? true) : false,
  }));

  const merged: AppData = {
    ...emptyInitialData,
    ...base,
    config: { ...emptyInitialData.config, ...(base.config ?? {}) },
    cooperativas,
    cooperados,
    users: (base.users ?? []).map((u) => ({
      ...u,
      role: normalizeUserRole(String(u.role)),
      cooperativaId: u.cooperativaId ?? (u.cooperadoId
        ? cooperados.find((c) => c.id === u.cooperadoId)?.cooperativaId
        : cooperativas[0]?.id),
      cooperativaCnpj:
        u.cooperativaCnpj ??
        (() => {
          const cid =
            u.cooperativaId ??
            (u.cooperadoId
              ? cooperados.find((c) => c.id === u.cooperadoId)?.cooperativaId
              : cooperativas[0]?.id);
          const coop = cooperativas.find((c) => c.id === cid);
          const digits = normalizeCnpj(coop?.cnpj ?? "");
          return digits.length === 14 ? digits : undefined;
        })(),
      modoAcesso: u.modoAcesso ?? "total",
      funcao: u.funcao,
      responsavelPrincipal: u.responsavelPrincipal,
      permissoesExtras: u.permissoesExtras,
      permissoesNegadas: u.permissoesNegadas,
    })),
    instituicoes: (base.instituicoes ?? []).map((i) => ({
      ...i,
      cooperativaId: i.cooperativaId ?? cooperativas[0]?.id ?? "",
    })),
    produtosInstituicao: base.produtosInstituicao ?? [],
    cronogramasContrato: base.cronogramasContrato ?? [],
    notasPedido: base.notasPedido ?? [],
    fichaCorrida: base.fichaCorrida ?? [],
    pagamentosCooperado: base.pagamentosCooperado ?? [],
    arquivosMensais: base.arquivosMensais ?? [],
    ajustesFichaMes: base.ajustesFichaMes ?? [],
    mensalidades: base.mensalidades ?? [],
    cotas: base.cotas ?? [],
    entregas: base.entregas ?? [],
    descontos: base.descontos ?? [],
    valoresAvulsosReceber: base.valoresAvulsosReceber ?? [],
    pagamentos: base.pagamentos ?? [],
    financeiro: base.financeiro ?? [],
    comunicados: (base.comunicados ?? []).map((c) => ({
      ...c,
      ativo: c.ativo ?? true,
    })),
    reclamacoes: base.reclamacoes ?? [],
    votacaoPautas: base.votacaoPautas ?? [],
    votacaoVotos: base.votacaoVotos ?? [],
    propriedades: base.propriedades ?? [],
    veiculos: base.veiculos ?? [],
    fechamentos: base.fechamentos ?? [],
    livroCaixa: base.livroCaixa ?? [],
    prestacoesContas: (base.prestacoesContas ?? [])
      .filter((p): p is PrestacaoContas => Boolean(p && typeof p === "object"))
      .map(normalizarPrestacaoContas),
    prestacoesContasExcluidas: base.prestacoesContasExcluidas ?? [],
    instituicoesExcluidas: base.instituicoesExcluidas ?? [],
    auditLog: base.auditLog ?? [],
    pareceresContabeis: base.pareceresContabeis ?? [],
    fechamentoSnapshots: base.fechamentoSnapshots ?? [],
  };

  return stripDemoData(
    migrateAjustesFichaMes(
      migrateResponsavelPrincipal(aplicarInstituicoesExcluidas(aplicarPrestacoesContasExcluidas(merged)))
    )
  );
}

function migrateResponsavelPrincipal(data: AppData): AppData {
  const principalPorCoop = new Map<string, string>();
  for (const u of data.users) {
    if (u.role !== "responsavel" || !u.cooperativaId) continue;
    if (u.responsavelPrincipal) {
      principalPorCoop.set(u.cooperativaId, u.id);
    }
  }

  const users = data.users.map((u) => {
    if (u.role !== "responsavel" || !u.cooperativaId) return u;
    let responsavelPrincipal = u.responsavelPrincipal;
    if (responsavelPrincipal === undefined) {
      const existing = principalPorCoop.get(u.cooperativaId);
      if (!existing) {
        responsavelPrincipal = true;
        principalPorCoop.set(u.cooperativaId, u.id);
      } else {
        responsavelPrincipal = u.id === existing;
      }
    }
    const funcao =
      u.funcao ??
      (responsavelPrincipal ? "Responsável principal" : "Responsável");
    return { ...u, responsavelPrincipal, funcao, modoAcesso: u.modoAcesso ?? "total" };
  });

  return { ...data, users };
}

function runAutomaticTasks(data: AppData): AppData {
  let current = compactarFotosNoArmazenamento(data);
  current = reconciliarFichaFromNotasConferidas(current);
  current = sincronizarMensalidadeCooperativa(current);
  const stripped = stripBinaryForPersist(current);
  return stripped;
}

/** Tarefas pesadas após primeira pintura — evita travar o celular na abertura. */
function scheduleAutomaticTasksIfNeeded(data: AppData): AppData {
  if (automaticTasksScheduled || typeof window === "undefined") return data;
  automaticTasksScheduled = true;

  const baseline = data;
  const run = () => {
    void (async () => {
      try {
        let working = runAutomaticTasks(baseline);
        working = await migrateInlinePhotosToIdb(working);
        working = stripBinaryForPersist(working);
        const serialized = JSON.stringify(working);
        if (serialized !== lastPersistedSerialized) saveDataSafe(working);
      } catch {
        /* não bloqueia o app */
      }
    })();
  };

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 50);
  }

  return data;
}

/** Inicia leitura do localStorage em background — não bloqueia a abertura do app. */
export function preloadAppData(): void {
  if (typeof window === "undefined" || memoryCache || dataWarmInFlight) return;
  dataWarmInFlight = true;
  const run = () => {
    try {
      loadData();
      reconcileSessionAfterDataLoad();
      notifyImmediate();
    } finally {
      dataWarmInFlight = false;
    }
  };
  queueMicrotask(run);
}

/** Aguarda localStorage carregar antes de sync destrutivo (timeout evita travar offline). */
export function waitForAppDataWarm(timeoutMs = 5000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (isAppDataWarm()) return Promise.resolve(true);
  preloadAppData();
  return new Promise((resolve) => {
    if (isAppDataWarm()) {
      resolve(true);
      return;
    }
    const timeout = setTimeout(() => {
      unsub();
      resolve(isAppDataWarm());
    }, timeoutMs);
    const unsub = subscribe(() => {
      if (isAppDataWarm()) {
        clearTimeout(timeout);
        unsub();
        resolve(true);
      }
    });
  });
}

function scheduleDataWarmIfNeeded(): void {
  if (memoryCache || dataWarmScheduled || typeof window === "undefined") return;
  dataWarmScheduled = true;
  preloadAppData();
}

function loadData(forceReload = false): AppData {
  if (typeof window === "undefined") return emptyInitialData;
  attachStorageListener();

  if (memoryCache && !forceReload) {
    const ensured = ensureCreatorAdminAccount(memoryCache);
    if (ensured.changed) {
      saveDataSafe(ensured.data);
      memoryCache = ensured.data;
    }
    return memoryCache;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    let data = emptyInitialData;
    const ensured = ensureCreatorAdminAccount(data);
    data = ensured.data;
    memoryCache = data;
    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
    lastPersistedSerialized = serialized;
    return memoryCache;
  }

  try {
    let data = migrateData(JSON.parse(stored));
    const ensured = ensureCreatorAdminAccount(data);
    data = ensured.data;
    const reset = applyOperationalResetIfNeeded(data);
    data = reset.data;

    if (ensured.changed) {
      const saved = saveDataSafe(data);
      memoryCache = saved.ok ? data : data;
      return memoryCache;
    }

    // Persiste limpeza de dados demo uma única vez
    if (!localStorage.getItem(DEMO_PURGED_KEY)) {
      const saved = saveDataSafe(data);
      memoryCache = saved.ok ? data : data;
      localStorage.setItem(DEMO_PURGED_KEY, "1");
      return memoryCache;
    }

    if (reset.changed) {
      const saved = saveDataSafe(data);
      memoryCache = saved.ok ? data : data;
      return memoryCache;
    }

    memoryCache = data;
    scheduleAutomaticTasksIfNeeded(data);
    return data;
  } catch {
    if (memoryCache) return memoryCache;
    try {
      const fallback = migrateData(JSON.parse(stored!));
      memoryCache = fallback;
      return fallback;
    } catch {
      memoryCache = emptyInitialData;
      return memoryCache;
    }
  }
}

function saveData(data: AppData): void {
  const result = saveDataSafe(data);
  if (!result.ok) throw new Error(result.error);
}

function isStorageQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014)
  );
}

export function saveDataSafe(data: AppData): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") return { ok: true };

  if (saveBatchDepth > 0) {
    memoryCache = data;
    saveBatchPending = data;
    notifyImmediate();
    return { ok: true };
  }

  return persistDataToStorage(data);
}

export function getData(): AppData {
  if (typeof window === "undefined") return emptyInitialData;
  attachStorageListener();
  if (memoryCache) return memoryCache;
  scheduleDataWarmIfNeeded();
  return emptyInitialData;
}

export function resetData(): void {
  if (typeof window === "undefined") return;
  memoryCache = emptyInitialData;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyInitialData));
  notify();
}

/** Zera entregas, fichas e pagamentos mantendo cadastros, contratos e mensalidades. */
export function resetOperationalData(): void {
  if (typeof window === "undefined") return;
  const current = loadData();
  const cleared = clearOperationalData(current);
  memoryCache = cleared;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleared));
  notify();
}

/** Força releitura do localStorage (útil após cadastro em outra aba). */
export function refreshData(): AppData {
  return loadData(true);
}

export function updateData(updater: (data: AppData) => AppData): AppData {
  const result = updateDataSafe(updater);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export function updateDataSafe(
  updater: (data: AppData) => AppData
): { ok: true; data: AppData } | { ok: false; error: string } {
  const current = loadData();
  const updated = updater(current);
  memoryCache = updated;

  if (saveBatchDepth > 0) {
    saveBatchPending = updated;
    notifyImmediate();
    return { ok: true, data: updated };
  }

  notifyImmediate();
  const saved = persistDataToStorage(updated, { skipNotify: true });
  if (!saved.ok) {
    memoryCache = current;
    notifyImmediate();
    return saved;
  }
  return { ok: true, data: memoryCache ?? updated };
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function addAuditEntry(
  data: AppData,
  entry: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    userId: string;
    userName: string;
    justification?: string;
    changes?: string;
  }
): AppData {
  const auditEntry = {
    id: generateId("audit"),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  if (typeof window !== "undefined") {
    try {
      const { queueAuditEntryForCloud } = require("@/services/cooperativeAuditCloudService") as typeof import("@/services/cooperativeAuditCloudService");
      const actor = data.users.find((u) => u.id === entry.userId);
      queueAuditEntryForCloud(data, auditEntry, actor);
    } catch {
      /* cloud audit opcional */
    }
  }
  return {
    ...data,
    auditLog: [auditEntry, ...data.auditLog],
  };
}

function persistSession(user: Omit<User, "password">): void {
  if (typeof window === "undefined") return;
  const safeUser = { ...user, role: normalizeUserRole(user.role) };
  localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
  // Migra sessão antiga (sessionStorage) se existir
  sessionStorage.removeItem(SESSION_KEY);
  notify();
}

function findUserByEmail(data: AppData, email: string): User | undefined {
  const normalized = normalizeCreatorEmail(email);
  return data.users.find(
    (u) => u.active && normalizeCreatorEmail(u.email) === normalized
  );
}

function resolveSessionUser(
  data: AppData,
  parsed: Omit<User, "password">
): User | undefined {
  const byId = data.users.find((u) => u.id === parsed.id && u.active);
  if (byId) return byId;
  return findUserByEmail(data, parsed.email);
}

async function finishLoginSession(user: User, data: AppData, plainPassword: string): Promise<User> {
  const { password: _, ...safeUser } = user;
  // Grava sessão antes de updateData — saveDataSafe dispara notify() e o AuthProvider relê getSession().
  persistSession(safeUser);

  let cooperativaCnpj = safeUser.cooperativaCnpj
    ? normalizeCnpj(safeUser.cooperativaCnpj)
    : undefined;
  if (!cooperativaCnpj) {
    const coopId = getUserCooperativaId(safeUser, data);
    const coop = coopId ? getCooperativaById(data, coopId) : undefined;
    if (coop?.cnpj) cooperativaCnpj = normalizeCnpj(coop.cnpj);
  }
  if (cooperativaCnpj && cooperativaCnpj !== safeUser.cooperativaCnpj) {
    safeUser.cooperativaCnpj = cooperativaCnpj;
    updateData((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === user.id ? { ...u, cooperativaCnpj } : u
      ),
    }));
    persistSession(safeUser);
  }
  const cloudProfile = userToCloudProfile(safeUser);
  setActiveCloudProfile(cloudProfile);
  clearCloudBootstrapCredentials();

  const cloudOk = await establishCloudSession(user.email, plainPassword, cloudProfile);
  if (!cloudOk) {
    const cloudHit = await loginViaCloudApi(user.email, plainPassword);
    if (cloudHit) setActiveCloudProfile(cloudHit.user);
  }

  return user;
}

/** Atualiza a sessão local após mudança de dados do usuário (ex.: nova senha). */
export function refreshSessionForUser(userId: string): void {
  const data = loadData();
  const user = data.users.find((u) => u.id === userId && u.active);
  if (!user || typeof window === "undefined") return;
  const { password: _, ...safeUser } = user;
  persistSession(safeUser);
}

function prepareDataForLogin(): AppData {
  let data = loadData(true);
  const ensured = ensureCreatorAdminAccount(data);
  if (ensured.changed) {
    saveDataSafe(ensured.data);
    invalidateCache();
    data = ensured.data;
    memoryCache = data;
  }
  return data;
}

/** Login direto do criador em /admin — valida hash local, nuvem em segundo plano. */
export async function loginCreatorAdminPortal(
  email: string,
  password: string
): Promise<User | null> {
  if (typeof window === "undefined") return null;
  if (normalizeCreatorEmail(email) !== normalizeCreatorEmail(CREATOR_ADMIN_EMAIL)) return null;

  const data = prepareDataForLogin();
  const user = findUserByEmail(data, CREATOR_ADMIN_EMAIL);
  if (!user) return null;

  const hashOk = verifyPasswordSync(password, user.password);
  const plainOk = password === CREATOR_ADMIN_PASSWORD;
  if (!hashOk && !plainOk) return null;

  return await finishLoginSession(user, data, password);
}

const CLOUD_BOOTSTRAP_ROLES: UserRole[] = ["cooperado", "responsavel", "tesoureiro", "admin", "contador"];

/**
 * Após login validado na nuvem, materializa users[] local + cooperativa/cooperado
 * para aparelhos novos (ex.: PWA instalado) sem duplicar cadastro.
 */
async function bootstrapLocalUserFromCloudLogin(
  profile: CloudSessionProfile,
  plainPassword: string
): Promise<User | null> {
  if (!CLOUD_BOOTSTRAP_ROLES.includes(normalizeUserRole(profile.role))) return null;

  const email = normalizeCreatorEmail(profile.email);
  const cnpj = profile.cooperativaCnpj ? normalizeCnpj(profile.cooperativaCnpj) : "";

  if (cnpj.length === 14) {
    await ensureCooperativaLocalForCnpj(cnpj);
    await syncCooperadosFromCloud(cnpj, profile.cooperativaId ?? undefined);
  }

  let data = loadData(true);
  let cooperativaId = profile.cooperativaId ?? undefined;
  if (!cooperativaId && cnpj.length === 14) {
    cooperativaId = findCooperativaByCnpj(data, cnpj)?.id;
  }

  let cooperadoId = profile.cooperadoId ?? undefined;
  if (cooperadoId && cooperativaId) {
    cooperadoId = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId) ?? cooperadoId;
  }

  const passwordHash = await hashPassword(plainPassword);
  const bootstrapped: User = {
    id: profile.id,
    email,
    password: passwordHash,
    name: profile.name,
    role: normalizeUserRole(profile.role),
    cooperadoId,
    cooperativaId,
    cooperativaCnpj: cnpj.length === 14 ? cnpj : profile.cooperativaCnpj,
    active: true,
  };

  updateData((d) => {
    const users = d.users.filter(
      (u) =>
        u.id !== bootstrapped.id &&
        normalizeCreatorEmail(u.email) !== email
    );
    return { ...d, users: [...users, bootstrapped] };
  });

  data = loadData(true);
  return data.users.find((u) => u.id === bootstrapped.id && u.active) ?? bootstrapped;
}

// Auth
export async function login(email: string, password: string): Promise<User | null> {
  if (typeof window === "undefined") return null;

  const data = prepareDataForLogin();
  const localUser = findUserByEmail(data, email);

  if (localUser) {
    const valid = await verifyPassword(password, localUser.password);
    if (valid) {
      if (!isPasswordHash(localUser.password)) {
        const hash = await hashPassword(password);
        updateData((d) => ({
          ...d,
          users: d.users.map((u) => (u.id === localUser.id ? { ...u, password: hash } : u)),
        }));
        localUser.password = hash;
      }
      return await finishLoginSession(localUser, data, password);
    }
  }

  const cloud = await loginViaCloudApi(email, password);
  if (!cloud) return null;

  const bootstrapped = await bootstrapLocalUserFromCloudLogin(cloud.user, password);
  if (!bootstrapped) return null;

  return await finishLoginSession(bootstrapped, getData(), password);
}

export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    void logoutCloudSession();
    clearCloudBootstrapCredentials();
    notify();
  }
}

function readStoredSessionRaw(): Omit<User, "password"> | null {
  if (typeof window === "undefined") return null;

  const legacy = sessionStorage.getItem(SESSION_KEY);
  if (legacy) {
    localStorage.setItem(SESSION_KEY, legacy);
    sessionStorage.removeItem(SESSION_KEY);
  }

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as Omit<User, "password">;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function reconcileSessionAfterDataLoad(): void {
  const parsed = readStoredSessionRaw();
  if (!parsed || !memoryCache) return;

  const current = resolveSessionUser(memoryCache, parsed);
  if (!current) {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    notify();
    return;
  }

  const { password: _, ...safeUser } = current;
  const serialized = JSON.stringify(safeUser);
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored && serialized !== stored) {
    localStorage.setItem(SESSION_KEY, serialized);
    notify();
  }
}

export function refreshStoredSession(): void {
  reconcileSessionAfterDataLoad();
}

export function getSession(): Omit<User, "password"> | null {
  const parsed = readStoredSessionRaw();
  if (!parsed) return null;

  if (memoryCache) {
    const current = resolveSessionUser(memoryCache, parsed);
    if (!current) {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    const { password: _, ...safeUser } = current;
    const serialized = JSON.stringify(safeUser);
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored && serialized !== stored) {
      localStorage.setItem(SESSION_KEY, serialized);
    }
    return safeUser;
  }

  scheduleDataWarmIfNeeded();
  return { ...parsed, role: normalizeUserRole(parsed.role) };
}

export interface RegisterCooperadoInput {
  nomeCompleto: string;
  email: string;
  password: string;
  cooperativaCnpj: string;
  cpfCnpj?: string;
  telefone?: string;
  comunidade?: string;
  /** Senha definida pela cooperativa para liberar o auto-cadastro. */
  senhaCadastroCooperado?: string;
}

export type RegisterResult =
  | { success: true; user: Omit<User, "password"> }
  | { success: false; error: string };

/** Consulta cooperativa cadastrada pelo CNPJ (local). */
export function lookupCooperativaByCnpj(cnpj: string): Pick<Cooperativa, "id" | "nome" | "cnpj"> | null {
  const data = loadData(true);
  const digits = normalizeCnpj(cnpj);
  const coop = findCooperativaByCnpj(data, digits);
  if (!coop) return null;
  return { id: coop.id, nome: coop.nome, cnpj: coop.cnpj };
}

/** Consulta local + nuvem; sincroniza cooperativa encontrada na nuvem para este dispositivo. */
export async function lookupCooperativaByCnpjAsync(
  cnpj: string
): Promise<(Pick<Cooperativa, "id" | "nome" | "cnpj"> & { exigeSenhaCadastro?: boolean }) | null> {
  const digits = normalizeCnpj(cnpj);
  const local = lookupCooperativaByCnpj(digits);
  if (local) {
    const data = loadData(true);
    const coop = findCooperativaByCnpj(data, digits);
    return {
      ...local,
      exigeSenhaCadastro: exigeSenhaCadastroCooperado(coop ?? undefined),
    };
  }

  try {
    const res = await fetch(`/api/cooperativas/lookup?cnpj=${digits}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.found || !json.cooperativa) return null;

    const cloud = await fetchCooperativaByCnpjFromCloud(digits);
    if (cloud) {
      updateData((d) => ({
        ...d,
        cooperativas: mergeCooperativaIntoData(d.cooperativas, cloud),
      }));
    }

    const row = json.cooperativa as Record<string, unknown>;
    return {
      id: String(row.id),
      nome: String(row.nome),
      cnpj: normalizeCnpj(String(row.cnpj)),
      exigeSenhaCadastro: Boolean(json.exigeSenhaCadastro),
    };
  } catch {
    return null;
  }
}

function remapCooperativaId(data: AppData, oldId: string, newId: string): AppData {
  if (oldId === newId) return data;
  const mapId = (id?: string) => (id === oldId ? newId : id);
  return {
    ...data,
    cooperativas: data.cooperativas.map((c) => (c.id === oldId ? { ...c, id: newId } : c)),
    users: data.users.map((u) => ({ ...u, cooperativaId: mapId(u.cooperativaId) })),
    cooperados: data.cooperados.map((c) => (c.cooperativaId === oldId ? { ...c, cooperativaId: newId } : c)),
    instituicoes: data.instituicoes.map((i) => (i.cooperativaId === oldId ? { ...i, cooperativaId: newId } : i)),
    produtosInstituicao: data.produtosInstituicao.map((p) =>
      p.cooperativaId === oldId ? { ...p, cooperativaId: newId } : p
    ),
    notasPedido: data.notasPedido.map((n) => (n.cooperativaId === oldId ? { ...n, cooperativaId: newId } : n)),
    fichaCorrida: data.fichaCorrida.map((f) => (f.cooperativaId === oldId ? { ...f, cooperativaId: newId } : f)),
    comunicados: data.comunicados.map((c) => (c.cooperativaId === oldId ? { ...c, cooperativaId: newId } : c)),
  };
}

/** Publica cooperativa local na nuvem e alinha IDs locais com o registro na nuvem. */
export async function syncCooperativaWithCloud(
  cooperativa: Cooperativa
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await syncCooperativaToCloud(cooperativa);
  if (!result.success) return result;

  const oldId = cooperativa.id;
  const cloudCoop = result.cooperativa;

  updateData((d) => {
    let next = {
      ...d,
      cooperativas: mergeCooperativaIntoData(d.cooperativas, cloudCoop),
    };
    next = remapCooperativaId(next, oldId, cloudCoop.id);
    return next;
  });

  return { success: true };
}

/** Garante que a cooperativa da diretoria exista na nuvem (ex.: cadastro antigo só local). */
export async function ensureCooperativaInCloudForUser(user: Omit<User, "password">): Promise<void> {
  const isDiretoria =
    user.role === "responsavel" || user.role === "admin" || user.role === "tesoureiro";
  if (!isDiretoria) return;

  const data = loadData();
  const coopId = getUserCooperativaId(user, data);
  const coop = coopId ? getCooperativaById(data, coopId) : undefined;
  if (!coop?.cnpj) return;

  const inCloud = await fetchCooperativaByCnpjFromCloud(coop.cnpj);
  if (inCloud) {
    updateData((d) => remapCooperativaId(
      { ...d, cooperativas: mergeCooperativaIntoData(d.cooperativas, inCloud) },
      coop.id,
      inCloud.id
    ));
    return;
  }

  await syncCooperativaWithCloud(coop);
}

export async function registerCooperado(input: RegisterCooperadoInput): Promise<RegisterResult> {
  const nome = input.nomeCompleto.trim();
  const email = input.email.trim().toLowerCase();
  const cnpjCoop = normalizeCnpj(input.cooperativaCnpj);

  if (!nome) return { success: false, error: "Informe o nome completo." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Informe um e-mail válido." };
  }
  if (!input.password || input.password.length < 6) {
    return { success: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (cnpjCoop.length !== 14) {
    return { success: false, error: "Informe o CNPJ da cooperativa com 14 dígitos." };
  }

  const data = loadData();
  let cooperativa = findCooperativaByCnpj(data, cnpjCoop);

  if (!cooperativa) {
    const cloud = await fetchCooperativaByCnpjFromCloud(cnpjCoop);
    if (cloud) {
      updateData((d) => ({
        ...d,
        cooperativas: mergeCooperativaIntoData(d.cooperativas, cloud),
      }));
      cooperativa = cloud;
    }
  }

  if (!cooperativa) {
    return {
      success: false,
      error: "CNPJ não cadastrado no sistema. Solicite à diretoria da cooperativa o cadastro antes de se registrar.",
    };
  }

  const senhaGate = await validarSenhaCadastroCooperado(
    cnpjCoop,
    cooperativa,
    input.senhaCadastroCooperado
  );
  if (!senhaGate.ok) {
    return { success: false, error: senhaGate.error };
  }

  if (data.users.some((u) => u.email.toLowerCase() === email)) {
    return { success: false, error: "Este e-mail já está cadastrado." };
  }

  const cpfDigits = (input.cpfCnpj ?? "").replace(/\D/g, "");
  if (cpfDigits && data.cooperados.some((c) => c.cpfCnpj.replace(/\D/g, "") === cpfDigits)) {
    return { success: false, error: "Este CPF/CNPJ já está cadastrado." };
  }

  const now = new Date().toISOString();
  const cooperadoId = generateId("c");
  const userId = generateId("u");

  const cooperado: Cooperado = {
    id: cooperadoId,
    cooperativaId: cooperativa.id,
    nomeCompleto: nome,
    cpfCnpj: cpfDigits || "",
    telefone: input.telefone?.trim() ?? "",
    endereco: "",
    comunidade: input.comunidade?.trim() ?? "",
    cafDap: "",
    chavePix: "",
    pixValido: false,
    banco: "",
    agencia: "",
    conta: "",
    status: "ativo",
    produtos: [],
    observacoes: "Cadastro realizado pelo portal do cooperado.",
    createdAt: now,
    updatedAt: now,
  };

  const newUser: User = {
    id: userId,
    email,
    password: await hashPassword(input.password),
    name: nome,
    role: "cooperado",
    cooperadoId,
    cooperativaId: cooperativa.id,
    cooperativaCnpj: cnpjCoop,
    active: true,
  };

  const { password: _, ...safeUser } = newUser;

  updateData((d) => {
    let updated = {
      ...d,
      cooperados: [...d.cooperados, cooperado],
      users: [...d.users, newUser],
    };
    updated = addAuditEntry(updated, {
      entityType: "cooperado",
      entityId: cooperadoId,
      action: "criar",
      userId,
      userName: nome,
      changes: "Auto-cadastro pelo portal",
    });
    updated = sincronizarCicloCobrancaSaas(updated, cooperativa.id);
    const withMens = ensureMensalidadeCooperado(updated, cooperadoId);
    return withMens ?? updated;
  });

  persistSession(safeUser);

  const cloudProfile = {
    id: userId,
    email,
    name: nome,
    role: "cooperado" as const,
    cooperativaId: cooperativa.id,
    cooperadoId,
    cooperativaCnpj: cnpjCoop,
  };

  const cloudUserOk = await registerCloudUser({
    ...cloudProfile,
    password: input.password,
  });

  if (!cloudUserOk) {
    await establishCloudSession(email, input.password, cloudProfile);
  }

  let pushResult = await pushCooperadoToCloud(cnpjCoop, cooperado, email);
  if (!pushResult.ok) {
    queueCooperadoPush(cnpjCoop, cooperado, email);
    await establishCloudSession(email, input.password, cloudProfile);
    pushResult = await pushCooperadoToCloud(cnpjCoop, cooperado, email);
  }
  if (!pushResult.ok) {
    queueCooperadoPush(cnpjCoop, cooperado, email);
  }

  return { success: true, user: safeUser };
}

export interface RegisterCooperativaInput {
  nome: string;
  cnpj: string;
  responsavel: string;
  email: string;
  password: string;
  telefone?: string;
  endereco?: string;
  senhaCadastroCooperado?: string;
  /** Obrigatório no 1º cadastro do responsável — aceitou regras de cobrança HB. */
  aceitouTermosCobranca?: boolean;
}

async function validarSenhaCadastroCooperado(
  cnpj: string,
  cooperativa: Cooperativa,
  senhaInformada?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const localExige = exigeSenhaCadastroCooperado(cooperativa);
  const check = await verifyCadastroSenhaCooperado(cnpj, senhaInformada ?? "");
  const exige = localExige || (check.configured && check.required);

  if (!exige) return { ok: true };

  const senha = senhaInformada?.trim() ?? "";
  if (!senha) {
    return {
      ok: false,
      error: "Esta cooperativa exige a senha de acesso ao cadastro. Solicite à diretoria.",
    };
  }

  if (cooperativa.senhaCadastroCooperado?.trim() || cooperativa.senhaCadastroCooperadoHash?.trim()) {
    const stored =
      cooperativa.senhaCadastroCooperadoHash?.trim() ||
      cooperativa.senhaCadastroCooperado?.trim() ||
      "";
    if (!verifyPasswordSync(senha, stored)) {
      return { ok: false, error: "Senha de acesso ao cadastro incorreta." };
    }
    return { ok: true };
  }

  if (check.configured && check.required && !check.valid) {
    return { ok: false, error: "Senha de acesso ao cadastro incorreta." };
  }

  return { ok: true };
}

/** Cadastro público da cooperativa pelo responsável (diretoria). */
export async function registerCooperativa(input: RegisterCooperativaInput): Promise<RegisterResult> {
  const nome = input.nome.trim();
  const responsavel = input.responsavel.trim();
  const email = input.email.trim().toLowerCase();
  const cnpj = normalizeCnpj(input.cnpj);

  if (!nome) return { success: false, error: "Informe o nome da cooperativa." };
  if (cnpj.length !== 14) return { success: false, error: "Informe um CNPJ válido com 14 dígitos." };
  if (!responsavel) return { success: false, error: "Informe o nome do responsável." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Informe um e-mail válido." };
  }
  if (!input.password || input.password.length < 6) {
    return { success: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (!input.aceitouTermosCobranca) {
    return {
      success: false,
      error: "Para cadastrar, é necessário aceitar as regras de cobrança da plataforma HB Cooperativas.",
    };
  }

  const data = loadData();
  if (data.users.some((u) => u.email.toLowerCase() === email)) {
    const existing = data.users.find((u) => u.email.toLowerCase() === email);
    if (existing?.role === "responsavel" || existing?.role === "admin" || existing?.role === "tesoureiro") {
      return {
        success: false,
        error:
          "Este e-mail já tem conta de responsável. Faça login — ao entrar, o CNPJ será publicado na nuvem automaticamente.",
      };
    }
    return { success: false, error: "Este e-mail já está em uso." };
  }

  const cloudResult = await registerCooperativaInCloud({
    nome,
    cnpj,
    responsavel,
    email,
    telefone: input.telefone,
    endereco: input.endereco,
    senhaCadastroCooperado: input.senhaCadastroCooperado?.trim() || undefined,
  });

  if (!cloudResult.success) {
    return {
      success: false,
      error: cloudResult.error || "Nuvem indisponível. Verifique o Supabase e tente novamente.",
    };
  }

  const now = new Date().toISOString();
  const cooperativa = {
    ...cloudResult.cooperativa,
    senhaCadastroCooperado: input.senhaCadastroCooperado?.trim() || undefined,
    cobrancaSaas: defaultCobrancaSaas({
      termosAceitosEm: now,
      statusMes: "aguardando_primeiro_cooperado",
    }),
  };
  const cooperativaId = cooperativa.id;

  if (data.cooperativas.some((c) => normalizeCnpj(c.cnpj) === cnpj && c.id !== cooperativaId)) {
    return { success: false, error: "Este CNPJ já está cadastrado no sistema." };
  }

  const userId = generateId("u");

  const newUser: User = {
    id: userId,
    email,
    password: await hashPassword(input.password),
    name: responsavel,
    role: "responsavel",
    cooperativaId,
    cooperativaCnpj: cnpj,
    active: true,
    funcao: "Responsável principal",
    responsavelPrincipal: true,
    modoAcesso: "total",
  };

  const { password: __, ...safeUser } = newUser;
  persistSession(safeUser);

  await registerCloudUser({
    id: userId,
    email,
    password: input.password,
    name: responsavel,
    role: "responsavel",
    cooperativaId,
    cooperativaCnpj: cnpj,
  });

  updateData((d) => {
    let updated = {
      ...d,
      cooperativas: mergeCooperativaIntoData(d.cooperativas, cooperativa),
      users: [...d.users, newUser],
    };
    updated = addAuditEntry(updated, {
      entityType: "cooperativa",
      entityId: cooperativaId,
      action: "criar",
      userId,
      userName: responsavel,
      changes: `Cooperativa ${nome} cadastrada pelo responsável`,
    });
    return updated;
  });

  return { success: true, user: safeUser };
}

export function isMesBloqueado(mesReferencia: string): boolean {
  const data = loadData();
  const fechamento = data.fechamentos.find((f) => f.mesReferencia === mesReferencia);
  return fechamento?.bloqueado ?? false;
}
