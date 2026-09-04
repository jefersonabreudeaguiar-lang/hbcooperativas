import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import type { Cooperado, PagamentoCooperadoRegistro } from "@/types";
import { getMesesReferenciaPagamento } from "@/services/notaPedidoService";

function pagamentoCobreMes(pagamento: PagamentoCooperadoRegistro, mesReferencia: string): boolean {
  return getMesesReferenciaPagamento(pagamento).includes(mesReferencia);
}

function cooperadoTemCicloEntregasNoMes(
  operacional: OperacionalSyncPayload,
  cooperativeId: string,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  const temFicha = (operacional.fichaCorrida ?? []).some(
    (f) =>
      f.cooperativaId === cooperativeId &&
      f.cooperadoId === cooperadoId &&
      f.mesReferencia === mesReferencia
  );
  if (temFicha) return true;

  const temArquivo = (operacional.arquivosMensais ?? []).some(
    (a) =>
      a.cooperativaId === cooperativeId &&
      a.cooperadoId === cooperadoId &&
      a.mesReferencia === mesReferencia &&
      (a.notaPedidoIds?.length ?? 0) > 0
  );
  if (temArquivo) return true;

  return (operacional.pagamentosCooperado ?? []).some(
    (p) => p.cooperadoId === cooperadoId && pagamentoCobreMes(p, mesReferencia)
  );
}

function cooperadoCicloEntregasQuitadoOperacional(
  operacional: OperacionalSyncPayload,
  cooperativeId: string,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  if (!cooperadoTemCicloEntregasNoMes(operacional, cooperativeId, cooperadoId, mesReferencia)) {
    return true;
  }

  const fichasPendentes = (operacional.fichaCorrida ?? []).some(
    (f) =>
      f.cooperativaId === cooperativeId &&
      f.cooperadoId === cooperadoId &&
      f.mesReferencia === mesReferencia &&
      f.status === "pendente"
  );
  if (fichasPendentes) return false;

  const aguardandoConfirmacao = (operacional.pagamentosCooperado ?? []).some(
    (p) =>
      p.cooperadoId === cooperadoId &&
      pagamentoCobreMes(p, mesReferencia) &&
      p.status === "aguardando_confirmacao"
  );
  if (aguardandoConfirmacao) return false;

  const avulsosPendentes = (operacional.valoresAvulsosReceber ?? []).some(
    (v) =>
      v.cooperativaId === cooperativeId &&
      v.cooperadoId === cooperadoId &&
      v.mesReferencia === mesReferencia &&
      v.status === "pendente"
  );
  if (avulsosPendentes) return false;

  return (operacional.pagamentosCooperado ?? []).some(
    (p) =>
      p.cooperadoId === cooperadoId &&
      pagamentoCobreMes(p, mesReferencia) &&
      p.status === "confirmado"
  );
}

/** Ciclo de entregas (mesReferencia) quitado — todos os cooperados com entregas/pagamentos confirmados. */
export function mesCicloEntregasPagamentosCompletos(
  operacional: OperacionalSyncPayload | null,
  cooperativeId: string,
  mesReferencia: string,
  cooperadosAtivos: Pick<Cooperado, "id">[]
): { ok: boolean; pendentes: string[] } {
  if (!operacional) return { ok: false, pendentes: [] };

  const pendentes = cooperadosAtivos
    .filter((c) => !cooperadoCicloEntregasQuitadoOperacional(operacional, cooperativeId, c.id, mesReferencia))
    .map((c) => c.id);

  return { ok: pendentes.length === 0, pendentes };
}

export function isCicloEntregasQuitadoParaRepasse(
  operacional: OperacionalSyncPayload | null,
  cooperativeId: string,
  mesReferencia: string,
  cooperadosAtivos: Pick<Cooperado, "id">[]
): boolean {
  return mesCicloEntregasPagamentosCompletos(operacional, cooperativeId, mesReferencia, cooperadosAtivos).ok;
}
