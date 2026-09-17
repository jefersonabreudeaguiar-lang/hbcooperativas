import type { Comunicado, ComunicadoMuralDuracao } from "@/types";

export const MURAL_DURACAO_OPCOES: { value: ComunicadoMuralDuracao; label: string }[] = [
  { value: "24h", label: "24 horas" },
  { value: "2d", label: "2 dias" },
  { value: "1sem", label: "1 semana" },
];

export function muralDuracaoHoras(duracao: ComunicadoMuralDuracao): number {
  if (duracao === "24h") return 24;
  if (duracao === "2d") return 48;
  return 168;
}

export function calcMuralExpiraEm(publicadoEm: string, duracao: ComunicadoMuralDuracao): string {
  const base = new Date(publicadoEm).getTime();
  return new Date(base + muralDuracaoHoras(duracao) * 3600_000).toISOString();
}

/** Cooperado: recado ainda dentro do tempo escolhido no mural (após publicar). */
export function comunicadoMuralAindaVisivel(c: Comunicado, nowMs = Date.now()): boolean {
  if (c.recorrente) return true;
  if (!c.muralPublicadoEm) return true;
  const duracao = c.muralDuracao ?? "24h";
  const expira = calcMuralExpiraEm(c.muralPublicadoEm, duracao);
  return new Date(expira).getTime() > nowMs;
}

export function formatMuralExpiraLabel(c: Comunicado): string | null {
  if (c.recorrente || !c.muralPublicadoEm) return null;
  const duracao = c.muralDuracao ?? "24h";
  const expira = calcMuralExpiraEm(c.muralPublicadoEm, duracao);
  const d = new Date(expira);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
