import type { User } from "@/types";

function parseCreatorEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** E-mails do criador da plataforma (variável NEXT_PUBLIC_APP_CREATOR_EMAILS). */
export function getAppCreatorEmails(): string[] {
  return parseCreatorEmails(process.env.NEXT_PUBLIC_APP_CREATOR_EMAILS);
}

/** Apenas o criador do app vê e acessa /admin — não outros responsáveis. */
export function isAppCreator(user: Pick<User, "email"> | null | undefined): boolean {
  if (!user?.email?.trim()) return false;
  const emails = getAppCreatorEmails();
  if (emails.length === 0) return false;
  return emails.includes(user.email.trim().toLowerCase());
}
