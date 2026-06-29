import type { User } from "@/types";

/** Criador da plataforma — sempre autorizado, mesmo sem variável de ambiente no deploy. */
const BUILTIN_APP_CREATOR_EMAILS = ["invisium3@gmail.com"];

function parseCreatorEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** E-mails do criador (env NEXT_PUBLIC_APP_CREATOR_EMAILS + lista fixa). */
export function getAppCreatorEmails(): string[] {
  const fromEnv = parseCreatorEmails(process.env.NEXT_PUBLIC_APP_CREATOR_EMAILS);
  return [...new Set([...BUILTIN_APP_CREATOR_EMAILS, ...fromEnv])];
}

/** Apenas o criador do app vê e acessa /admin — não outros responsáveis. */
export function isAppCreator(user: Pick<User, "email"> | null | undefined): boolean {
  if (!user?.email?.trim()) return false;
  const emails = getAppCreatorEmails();
  if (emails.length === 0) return false;
  return emails.includes(user.email.trim().toLowerCase());
}
