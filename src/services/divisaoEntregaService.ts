import type { DivisaoEntregaNota } from "@/types";

export { dividirEntregaEntreCooperados, rebuildFichasNota, criarDivisaoEntregaFromParticipantes, buildFichasDivisaoFromNota } from "@/services/notaPedidoService";

export { isDivisaoEntregaHabilitada, DIVISAO_ENTREGA_HABILITADA } from "@/lib/conferencia/divisaoEntregaPolicy";

export function textoInformativoDivisaoEntrega(divisao: DivisaoEntregaNota): string {
  const n = divisao.participantes.length;
  return `Lançado por ${divisao.cooperadoOrigemNome} · dividido entre ${n} cooperado${n !== 1 ? "s" : ""}`;
}

export function nomesParticipantesDivisao(divisao: DivisaoEntregaNota): string {
  return divisao.participantes.map((p) => p.cooperadoNome).join(", ");
}
