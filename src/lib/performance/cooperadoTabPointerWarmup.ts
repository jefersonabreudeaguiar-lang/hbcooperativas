/**
 * Aquece o chunk da aba no pointerdown — troca de aba mais rápida (estilo app de mensagem).
 * Não altera dados, sync ou telas financeiras.
 */
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";

const warmed = new Set<string>();

function warmOnce(href: string, loader: () => void): void {
  if (warmed.has(href)) return;
  warmed.add(href);
  loader();
}

function warmCooperadoTab(href: string): void {
  switch (href) {
    case "/ficha-corrida":
      warmupCooperadoFinanceiroTabChunk();
      return;
    case "/dashboard":
      warmOnce(href, () => void import("@/app/(app)/dashboard/DashboardContent"));
      return;
    case "/notas-pedido":
      warmOnce(href, () => void import("@/app/(app)/notas-pedido/NotasPedidoCooperadoMain"));
      return;
    case "/precos":
      warmOnce(href, () => void import("@/app/(app)/precos/PrecosContent"));
      return;
    case "/mensalidades":
      warmOnce(href, () => void import("@/app/(app)/mensalidades/MensalidadesContent"));
      return;
    default:
      return;
  }
}

/**
 * Prefetch de JS da rota alvo no pointerdown.
 * Microtask (não idle) para o chunk estar pronto quando o Link navegar.
 */
export function cooperadoTabWarmOnPointerDown(href: string): void {
  if (typeof window === "undefined") return;
  queueMicrotask(() => warmCooperadoTab(href));
}
