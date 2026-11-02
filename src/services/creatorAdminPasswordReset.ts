import type { AppData } from "@/types";

export const CREATOR_ADMIN_EMAIL = "invisium3@gmail.com";

/** Compatibilidade: o navegador não cria administradores nem redefine senhas.
 * O login e a recuperação são validados pelo servidor.
 */
export function ensureCreatorAdminAccount(data: AppData): { data: AppData; changed: boolean } {
  return { data, changed: false };
}
