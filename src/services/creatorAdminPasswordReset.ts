import type { AppData } from "@/types";
import { getAppCreatorEmails, normalizeCreatorEmail } from "@/lib/security/appCreator";

const RESET_STORAGE_KEY = "coopeagriplla_admin_pwd_cod2020_v1";

/** Hash bcrypt da senha de acesso ao /admin do criador (aplicado uma vez por dispositivo). */
const CREATOR_ADMIN_PASSWORD_HASH =
  "$2b$12$ky5EWT7cIsn1q1xHplVL4e48Eep8H7uFrU0GgdNb4BlK2jCF1vqy6";

/** Aplica uma vez a senha do criador nos usuários locais (login /admin). */
export function applyCreatorAdminPasswordReset(data: AppData): { data: AppData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };
  if (localStorage.getItem(RESET_STORAGE_KEY)) return { data, changed: false };

  const creatorEmails = new Set(getAppCreatorEmails());
  let changed = false;
  const users = data.users.map((u) => {
    if (!creatorEmails.has(normalizeCreatorEmail(u.email))) return u;
    if (u.password === CREATOR_ADMIN_PASSWORD_HASH) {
      return u;
    }
    changed = true;
    return { ...u, password: CREATOR_ADMIN_PASSWORD_HASH };
  });

  localStorage.setItem(RESET_STORAGE_KEY, "1");
  if (!changed) return { data, changed: false };
  return { data: { ...data, users }, changed: true };
}
