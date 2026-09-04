import type { User } from "@/types";

/** Criador da plataforma — sempre autorizado, mesmo sem variável de ambiente no deploy. */
const BUILTIN_APP_CREATOR_EMAILS = ["invisium3@gmail.com"];

function parseCreatorEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((email) => normalizeCreatorEmail(email))
    .filter(Boolean);
}

/** Normaliza e-mail para login/cadastro (Gmail ignora pontos e sufixo +alias). */
export function normalizeAuthEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.split("+")[0]?.replace(/\./g, "") ?? local;
  }

  return `${local}@${domain}`;
}

/** @deprecated Use normalizeAuthEmail — mantido para compatibilidade interna. */
export const normalizeCreatorEmail = normalizeAuthEmail;

/** E-mails do criador (env NEXT_PUBLIC_APP_CREATOR_EMAILS + lista fixa). */
export function getAppCreatorEmails(): string[] {
  const fromEnv = parseCreatorEmails(process.env.NEXT_PUBLIC_APP_CREATOR_EMAILS);
  return [...new Set([...BUILTIN_APP_CREATOR_EMAILS.map(normalizeCreatorEmail), ...fromEnv])];
}

/** Apenas o criador do app vê e acessa /admin — não outros responsáveis. */
export function isAppCreator(user: Pick<User, "email"> | null | undefined): boolean {
  if (user?.email?.trim() && matchesCreatorEmail(user.email)) return true;

  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("coopeagriplla_session");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { email?: string };
    return matchesCreatorEmail(parsed.email);
  } catch {
    return false;
  }
}

function matchesCreatorEmail(email: string | undefined): boolean {
  if (!email?.trim()) return false;
  return getAppCreatorEmails().includes(normalizeCreatorEmail(email));
}

/** Sessão JWT/API do administrador global HB (criador da plataforma). */
export function isPlatformAdminSession(session: { email?: string | null } | null | undefined): boolean {
  if (!session?.email?.trim()) return false;
  return matchesCreatorEmail(session.email);
}
