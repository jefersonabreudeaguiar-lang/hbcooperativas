/**
 * Sub-visões pesadas do responsável/cooperado em notas — webpack chunks separados, sob demanda.
 */
export type CooperadoNotasSecondaryVista =
  | "fila"
  | "cooperado"
  | "historico"
  | "correcoes"
  | "aberto";

const loaded = new Set<string>();

function once(key: string, fn: () => void): void {
  if (loaded.has(key)) return;
  loaded.add(key);
  fn();
}

export function loadCooperadoNotasSecondaryChunks(
  vista: CooperadoNotasSecondaryVista,
  opts?: { cooperadoFichaTab?: boolean }
): void {
  if (typeof window === "undefined") return;

  if (vista === "fila" || vista === "cooperado") {
    once("fila", () => {
      void import("@/components/notas/ResponsavelFilaCooperadosList");
    });
  }
  if (vista === "historico") {
    once("historico", () => {
      void import("@/components/notas/NotasPedidoHistoricoResponsavel");
    });
  }
  if (vista === "correcoes") {
    once("correcoes", () => {
      void import("@/components/notas/CorrecoesEntregasPanel");
    });
  }
  if (vista === "aberto") {
    once("aberto", () => {
      void import("@/components/notas/LancamentosEmAbertoPainel");
    });
  }
  if (opts?.cooperadoFichaTab) {
    once("coop-ficha", () => {
      void import("@/components/cooperado/CooperadoMinhaFichaTab");
    });
  }
}
