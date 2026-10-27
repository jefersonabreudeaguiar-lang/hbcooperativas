/**
 * IO de persistência local (cooperado + responsável por CNPJ).
 * Módulo isolado — importar daqui no dataStore (não via staffGestaoSnapshotGuard).
 */
import type { AppData } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

function primaryStaffGestaoCnpjFromLegacyBlob(data: AppData): string {
  const ranked = (data.cooperativas ?? [])
    .map((c) => {
      const digits = normalizeCnpj(String(c.cnpj ?? ""));
      if (digits.length !== 14) return null;
      const notas = (data.notasPedido ?? []).filter((n) => n.cooperativaId === c.id).length;
      const fichas = (data.fichaCorrida ?? []).filter((f) => f.cooperativaId === c.id).length;
      return { digits, score: notas + fichas };
    })
    .filter((x): x is { digits: string; score: number } => Boolean(x));
  if (ranked.length === 0) return "";
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].digits;
}

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

export function staffGestaoNuncaGravaBlobGlobal(): true {
  return true;
}

function staffGestaoSemCnpj(hint: { role?: string; cnpj: string }): boolean {
  return sessionLooksStaffGestao(hint.role) && hint.cnpj.length !== 14;
}

export function resolveAppDataStorageKey(opts?: AppDataPersistHint): string {
  const hint = resolveHint(opts);
  if (sessionLooksStaffGestao(hint.role) && hint.cnpj.length === 14) {
    return staffGestaoPersistKey(hint.cnpj);
  }
  return APP_DATA_STORAGE_KEY;
}

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
    const owner = primaryStaffGestaoCnpjFromLegacyBlob(parsed);
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
  if (staffGestaoSemCnpj(hint)) return null;
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
  if (staffGestaoSemCnpj(hint)) return false;
  const key = resolveAppDataStorageKey({ role: hint.role, cnpj: hint.cnpj, storage: hint.storage });
  if (sessionLooksStaffGestao(hint.role) && key === APP_DATA_STORAGE_KEY) return false;
  try {
    hint.storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function quarantineStaffGestaoPersistCorrupt(opts?: AppDataPersistHint): boolean {
  const hint = resolveHint(opts);
  if (!hint.storage || !sessionLooksStaffGestao(hint.role)) return false;
  if (hint.cnpj.length !== 14) return false;
  const key = staffGestaoPersistKey(hint.cnpj);
  try {
    const raw = hint.storage.getItem(key);
    if (raw) {
      hint.storage.setItem(`${key}:quarantine:${Date.now()}`, raw.slice(0, 500_000));
      hint.storage.removeItem(key);
    }
    hint.storage.setItem("hb-staff-persist-quarantine", hint.cnpj);
    return true;
  } catch {
    return false;
  }
}

export function removeAppDataPersistRaw(opts?: AppDataPersistHint): void {
  const hint = resolveHint(opts);
  if (!hint.storage) return;
  if (staffGestaoSemCnpj(hint)) return;
  const key = resolveAppDataStorageKey({ role: hint.role, cnpj: hint.cnpj, storage: hint.storage });
  if (sessionLooksStaffGestao(hint.role) && key === APP_DATA_STORAGE_KEY) return;
  try {
    hint.storage.removeItem(key);
  } catch {
    /* private */
  }
}
