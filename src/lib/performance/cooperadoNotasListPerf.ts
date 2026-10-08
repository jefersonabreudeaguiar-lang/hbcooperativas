/**
 * Fase 3 — política de performance para listas longas de notas (sem split do monólito ainda).
 */

const OFF = new Set(["false", "0", "no", "off"]);

function readMinItemsForContentVisibility(): number {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_COOPERADO_NOTAS_CONTENT_VISIBILITY_MIN ?? "48")
      : "48";
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 48;
}

export function cooperadoNotasListShouldUseContentVisibility(itemCount: number): boolean {
  if (OFF.has(String(process.env.NEXT_PUBLIC_COOPERADO_NOTAS_CONTENT_VISIBILITY ?? "true").toLowerCase())) {
    return false;
  }
  return itemCount >= readMinItemsForContentVisibility();
}

/** Classe Tailwind arbitrária — pinta só itens visíveis em listas muito longas. */
export function cooperadoNotasPendentesListPerfClass(itemCount: number): string {
  if (!cooperadoNotasListShouldUseContentVisibility(itemCount)) return "";
  return "[&>button]:[content-visibility:auto] [&>button]:[contain-intrinsic-size:0_3.5rem]";
}
