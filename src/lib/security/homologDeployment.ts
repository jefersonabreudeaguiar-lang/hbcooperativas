/**
 * Deploy de laboratório (homolog) — origem e PWA separados do app oficial do cooperado.
 * Ative com APP_ENV=homolog e NEXT_PUBLIC_APP_URL apontando para o domínio do lab na Vercel.
 */

export function isHomologAppDeployment(): boolean {
  const raw = (
    process.env.NEXT_PUBLIC_APP_ENV ??
    process.env.APP_ENV ??
    ""
  )
    .trim()
    .toLowerCase();
  return raw === "homolog" || raw === "lab";
}

export function homologLabDisplayName(): string {
  return "HB Cooperativas — Laboratório";
}

export function homologLabShortName(): string {
  return "HB Lab";
}
