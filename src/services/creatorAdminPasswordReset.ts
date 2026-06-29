import type { AppData, User } from "@/types";
import { getAppCreatorEmails, normalizeCreatorEmail } from "@/lib/security/appCreator";
import { normalizeCnpj } from "@/utils/cooperativa";
import { isPasswordHash, verifyPasswordSync } from "@/lib/security/password";

/** Conta fixa do criador — login em /admin */
export const CREATOR_ADMIN_EMAIL = "invisium3@gmail.com";
export const CREATOR_ADMIN_PASSWORD = "cod2020cod";

/** bcrypt 60 chars — hash anterior estava truncado e impedia o login */
const CREATOR_ADMIN_PASSWORD_HASH =
  "$2b$12$JxDmDr0Zj9.yrUuL3wpBHOFPoQ3yKKuuq6nSIeTXM6aavOJyUn.t.";

function creatorPasswordValid(stored: string): boolean {
  if (!isPasswordHash(stored)) return false;
  return verifyPasswordSync(CREATOR_ADMIN_PASSWORD, stored);
}

function creatorUserId(email: string): string {
  return `u_creator_${normalizeCreatorEmail(email).replace(/[^a-z0-9]/g, "_")}`;
}

function buildCreatorUser(data: AppData, email: string): User {
  const normalized = normalizeCreatorEmail(email);
  const coop = data.cooperativas.find((c) => c.status !== "inativa") ?? data.cooperativas[0];
  return {
    id: creatorUserId(normalized),
    email: normalized,
    password: CREATOR_ADMIN_PASSWORD_HASH,
    name: "Criador HB Cooperativas",
    role: "responsavel",
    cooperativaId: coop?.id,
    cooperativaCnpj: coop?.cnpj ? normalizeCnpj(coop.cnpj) : undefined,
    active: true,
    funcao: "Criador da plataforma",
    responsavelPrincipal: true,
    modoAcesso: "total",
  };
}

/** Garante conta e senha do criador para login em /admin (local). */
export function ensureCreatorAdminAccount(data: AppData): { data: AppData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };

  const emails = getAppCreatorEmails();
  if (emails.length === 0) return { data, changed: false };

  let changed = false;
  const users = [...data.users];

  for (const email of emails) {
    const normalized = normalizeCreatorEmail(email);
    const idx = users.findIndex((u) => normalizeCreatorEmail(u.email) === normalized);

    if (idx < 0) {
      users.push(buildCreatorUser(data, normalized));
      changed = true;
      continue;
    }

    const cur = users[idx];
    const patch: Partial<User> = {};
    if (!creatorPasswordValid(cur.password)) patch.password = CREATOR_ADMIN_PASSWORD_HASH;
    if (!cur.active) patch.active = true;
    if (cur.email !== normalized) patch.email = normalized;
    if (!cur.cooperativaId && data.cooperativas[0]?.id) {
      patch.cooperativaId = data.cooperativas[0].id;
      patch.cooperativaCnpj = normalizeCnpj(data.cooperativas[0].cnpj);
    }

    if (Object.keys(patch).length > 0) {
      users[idx] = { ...cur, ...patch };
      changed = true;
    }
  }

  if (!changed) return { data, changed: false };
  return { data: { ...data, users }, changed: true };
}
