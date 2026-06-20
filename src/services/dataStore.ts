"use client";

import type { AppData, AuditAction, User, Cooperado, Cooperativa } from "@/types";
import { emptyInitialData, DEMO_ENTITY_IDS, DEMO_EMAILS, DEMO_CNPJ } from "@/mock/data";
import { findCooperativaByCnpj, getCooperativaById, getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { ensureMensalidadesDoMes, ensureMensalidadeCooperado, atualizarStatusMensalidades } from "@/services/mensalidadeService";
import {
  fetchCooperativaByCnpjFromCloud,
  registerCooperativaInCloud,
  mergeCooperativaIntoData,
  syncCooperativaToCloud,
} from "@/services/cooperativaCloudService";

const STORAGE_KEY = "coopeagriplla_data";
const SESSION_KEY = "coopeagriplla_session";
const DEMO_PURGED_KEY = "coopeagriplla_demo_purged";

type Listener = () => void;
const listeners = new Set<Listener>();
let memoryCache: AppData | null = null;
let storageListenerAttached = false;

function invalidateCache(): void {
  memoryCache = null;
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

function notify() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
    notasPedido: filterByCooperado(data.notasPedido ?? []),
    fichaCorrida: filterByCooperado(data.fichaCorrida ?? []),
    mensalidades: filterByCooperado(data.mensalidades ?? []),
    cotas: filterByCooperado(data.cotas ?? []),
    entregas: (data.entregas ?? []).filter(
      (e) => !DEMO_ENTITY_IDS.has(e.id) && cooperadoIds.has(e.cooperadoId)
    ),
    descontos: filterByCooperado(data.descontos ?? []),
    pagamentos: filterByCooperado(data.pagamentos ?? []),
    financeiro: (data.financeiro ?? []).filter((f) => !DEMO_ENTITY_IDS.has(f.id)),
    comunicados: (data.comunicados ?? []).filter((c) => !DEMO_ENTITY_IDS.has(c.id)),
    propriedades: filterByCooperado(data.propriedades ?? []),
    veiculos: filterByCooperado(data.veiculos ?? []),
    fechamentos: (data.fechamentos ?? []).filter((f) => !DEMO_ENTITY_IDS.has(f.id)),
    auditLog: (data.auditLog ?? []).filter((a) => !DEMO_ENTITY_IDS.has(a.id)),
  };
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
      cooperativaId: u.cooperativaId ?? (u.cooperadoId
        ? cooperados.find((c) => c.id === u.cooperadoId)?.cooperativaId
        : cooperativas[0]?.id),
    })),
    instituicoes: (base.instituicoes ?? []).map((i) => ({
      ...i,
      cooperativaId: i.cooperativaId ?? cooperativas[0]?.id ?? "",
    })),
    produtosInstituicao: base.produtosInstituicao ?? [],
    notasPedido: base.notasPedido ?? [],
    fichaCorrida: base.fichaCorrida ?? [],
    pagamentosCooperado: base.pagamentosCooperado ?? [],
    arquivosMensais: base.arquivosMensais ?? [],
    mensalidades: base.mensalidades ?? [],
    cotas: base.cotas ?? [],
    entregas: base.entregas ?? [],
    descontos: base.descontos ?? [],
    pagamentos: base.pagamentos ?? [],
    financeiro: base.financeiro ?? [],
    comunicados: (base.comunicados ?? []).map((c) => ({
      ...c,
      ativo: c.ativo ?? true,
    })),
    propriedades: base.propriedades ?? [],
    veiculos: base.veiculos ?? [],
    fechamentos: base.fechamentos ?? [],
    auditLog: base.auditLog ?? [],
  };

  return stripDemoData(merged);
}

function runAutomaticTasks(data: AppData): AppData {
  let current = data;
  const afterMensalidades = ensureMensalidadesDoMes(current);
  if (afterMensalidades) current = afterMensalidades;
  const afterStatus = atualizarStatusMensalidades(current);
  if (afterStatus) current = afterStatus;
  return current;
}

function loadData(forceReload = false): AppData {
  if (typeof window === "undefined") return emptyInitialData;
  attachStorageListener();

  if (memoryCache && !forceReload) return memoryCache;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    memoryCache = emptyInitialData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyInitialData));
    return memoryCache;
  }

  try {
    let data = migrateData(JSON.parse(stored));

    // Persiste limpeza de dados demo uma única vez
    if (!localStorage.getItem(DEMO_PURGED_KEY)) {
      saveData(data);
      localStorage.setItem(DEMO_PURGED_KEY, "1");
      return data;
    }

    const afterTasks = runAutomaticTasks(data);
    if (afterTasks !== data) {
      saveData(afterTasks);
      return afterTasks;
    }

    memoryCache = data;
    return data;
  } catch {
    memoryCache = emptyInitialData;
    return memoryCache;
  }
}

function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  memoryCache = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  notify();
}

export function getData(): AppData {
  return loadData();
}

export function resetData(): void {
  if (typeof window === "undefined") return;
  memoryCache = emptyInitialData;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyInitialData));
  notify();
}

/** Força releitura do localStorage (útil após cadastro em outra aba). */
export function refreshData(): AppData {
  return loadData(true);
}

export function updateData(updater: (data: AppData) => AppData): AppData {
  const current = loadData();
  const updated = updater(current);
  saveData(updated);
  return updated;
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
  return {
    ...data,
    auditLog: [
      {
        id: generateId("audit"),
        timestamp: new Date().toISOString(),
        ...entry,
      },
      ...data.auditLog,
    ],
  };
}

function persistSession(user: Omit<User, "password">): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  // Migra sessão antiga (sessionStorage) se existir
  sessionStorage.removeItem(SESSION_KEY);
  notify();
}

// Auth
export function login(email: string, password: string): User | null {
  const data = loadData();
  const user = data.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password && u.active
  );
  if (user && typeof window !== "undefined") {
    const { password: _, ...safeUser } = user;
    persistSession(safeUser);
  }
  return user ?? null;
}

export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    notify();
  }
}

export function getSession(): Omit<User, "password"> | null {
  if (typeof window === "undefined") return null;

  const legacy = sessionStorage.getItem(SESSION_KEY);
  if (legacy) {
    localStorage.setItem(SESSION_KEY, legacy);
    sessionStorage.removeItem(SESSION_KEY);
  }

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Omit<User, "password">;
    const data = loadData();
    const current = data.users.find(
      (u) =>
        u.id === parsed.id &&
        u.email.toLowerCase() === String(parsed.email).toLowerCase() &&
        u.active
    );
    if (!current) {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    const { password: _, ...safeUser } = current;
    const serialized = JSON.stringify(safeUser);
    if (serialized !== stored) {
      localStorage.setItem(SESSION_KEY, serialized);
    }
    return safeUser;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export interface RegisterCooperadoInput {
  nomeCompleto: string;
  email: string;
  password: string;
  cooperativaCnpj: string;
  cpfCnpj?: string;
  telefone?: string;
  comunidade?: string;
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
): Promise<Pick<Cooperativa, "id" | "nome" | "cnpj"> | null> {
  const digits = normalizeCnpj(cnpj);
  const local = lookupCooperativaByCnpj(digits);
  if (local) return local;

  const cloud = await fetchCooperativaByCnpjFromCloud(digits);
  if (!cloud) return null;

  updateData((d) => ({
    ...d,
    cooperativas: mergeCooperativaIntoData(d.cooperativas, cloud),
  }));

  return { id: cloud.id, nome: cloud.nome, cnpj: cloud.cnpj };
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
    user.role === "presidente" || user.role === "admin" || user.role === "tesoureiro";
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
    password: input.password,
    name: nome,
    role: "cooperado",
    cooperadoId,
    cooperativaId: cooperativa.id,
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
    const withMens = ensureMensalidadeCooperado(updated, cooperadoId);
    return withMens ?? updated;
  });

  persistSession(safeUser);

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

  const data = loadData();
  if (data.users.some((u) => u.email.toLowerCase() === email)) {
    const existing = data.users.find((u) => u.email.toLowerCase() === email);
    if (existing?.role === "presidente" || existing?.role === "admin" || existing?.role === "tesoureiro") {
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
  });

  if (!cloudResult.success) {
    return {
      success: false,
      error: cloudResult.error || "Nuvem indisponível. Verifique o Supabase e tente novamente.",
    };
  }

  const now = new Date().toISOString();
  const cooperativa = cloudResult.cooperativa;
  const cooperativaId = cooperativa.id;

  if (data.cooperativas.some((c) => normalizeCnpj(c.cnpj) === cnpj && c.id !== cooperativaId)) {
    return { success: false, error: "Este CNPJ já está cadastrado no sistema." };
  }

  const userId = generateId("u");

  const newUser: User = {
    id: userId,
    email,
    password: input.password,
    name: responsavel,
    role: "presidente",
    cooperativaId,
    active: true,
  };

  const { password: __, ...safeUser } = newUser;
  persistSession(safeUser);

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
