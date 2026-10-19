/**
 * Arquivo local do responsável é por CNPJ.
 * Cooperado continua em coopeagriplla_data — não misturamos a casa com cooperativa nova.
 */
import type { AppData } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { primaryStaffGestaoCnpjFromData } from "@/lib/staff/staffGestaoSnapshotGuard";

export const APP_DATA_STORAGE_KEY = "coopeagriplla_data";

export type AppDataPersistStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AppDataPersistHint = {
  role?: string;
  cnpj?: string;
  storage?: AppDataPersistStorage;
};

function browserStorage(): AppDataPersistStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionLooksStaffGestao(role?: string): boolean {
  return role === "responsavel" || role === "tesoureiro" || role === "admin";
}

function readSessionHint(storage?: AppDataPersistStorage): { role?: string; cnpj: string } {
  const store = storage ?? browserStorage();
  if (!store) return { cnpj: "" };
  try {
    const raw = store.getItem("coopeagriplla_session");
    if (!raw) return { cnpj: "" };
    const parsed = JSON.parse(raw) as { role?: string; cooperativaCnpj?: string };
    return {
      role: parsed.role,
      cnpj: normalizeCnpj(parsed.cooperativaCnpj ?? ""),
    };
  } catch {
    return { cnpj: "" };
  }
}

function resolveHint(opts?: AppDataPersistHint): { role?: string; cnpj: string; storage: AppDataPersistStorage | null } {
  const storage = opts?.storage ?? browserStorage();
  const session = readSessionHint(storage ?? undefined);
  const cnpj = normalizeCnpj(opts?.cnpj ?? session.cnpj);
  return {
    role: opts?.role ?? session.role,
    cnpj,
    storage,
  };
}

export function staffGestaoPersistKey(cnpj: string): string {
  return `${APP_DATA_STORAGE_KEY}:${normalizeCnpj(cnpj)}`;
}

export function isAppDataPersistStorageKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return key === APP_DATA_STORAGE_KEY || key.startsWith(`${APP_DATA_STORAGE_KEY}:`);
}

/** Cooperado e sessão sem CNPJ ficam no arquivo legado. Responsável com CNPJ usa chave isolada. */
export function resolveAppDataStorageKey(opts?: AppDataPersistHint): string {
  const hint = resolveHint(opts);
  if (sessionLooksStaffGestao(hint.role) && hint.cnpj.length === 14) {
    return staffGestaoPersistKey(hint.cnpj);
  }
  return APP_DATA_STORAGE_KEY;
}

/** Copia o arquivo antigo só se for da mesma cooperativa. Não apaga o legado. */
export function migrateLegacyAppDataIfMatches(
  cnpj: string,
  storage?: AppDataPersistStorage
): string | null {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  const store = storage ?? browserStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(APP_DATA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || typeof parsed !== "object") return null;
    const owner = primaryStaffGestaoCnpjFromData(parsed);
    if (!owner || owner !== digits) return null;
    store.setItem(staffGestaoPersistKey(digits), raw);
    return raw;
  } catch {
    return null;
  }
}

export function readAppDataPersistRaw(opts?: AppDataPersistHint): string | null {
  const hint = resolveHint(opts);
  if (!hint.storage) return null;
  const key = resolveAppDataStorageKey({ role: hint.role, cnpj: hint.cnpj, storage: hint.storage });
  if (key === APP_DATA_STORAGE_KEY) {
    return hint.storage.getItem(APP_DATA_STORAGE_KEY);
  }
  const scoped = hint.storage.getItem(key);
  if (scoped) return scoped;
  return migrateLegacyAppDataIfMatches(hint.cnpj, hint.storage);
}

export function writeAppDataPersistRaw(serialized: string, opts?: AppDataPersistHint): boolean {
  const hint = resolveHint(opts);
  if (!hint.storage) return false;
  const key = resolveAppDataStorageKey({ role: hint.role, cnpj: hint.cnpj, storage: hint.storage });
  try {
    hint.storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function removeAppDataPersistRaw(opts?: AppDataPersistHint): void {
  const hint = resolveHint(opts);
  if (!hint.storage) return;
  const key = resolveAppDataStorageKey({ role: hint.role, cnpj: hint.cnpj, storage: hint.storage });
  try {
    hint.storage.removeItem(key);
  } catch {
    /* private */
  }
}
