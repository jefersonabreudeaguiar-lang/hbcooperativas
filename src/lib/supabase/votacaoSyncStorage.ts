import type { SupabaseClient } from "@supabase/supabase-js";
import type { VotacaoVoto } from "@/types";
import { fetchOperacionalSync, uploadOperacionalSync, type OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";

export async function appendVotacaoVotoToOperacional(
  supabase: SupabaseClient,
  cnpj: string,
  voto: VotacaoVoto
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await fetchOperacionalSync(supabase, cnpj);
  if (!current) {
    return { ok: false, error: "Dados operacionais não encontrados na nuvem." };
  }

  const pauta = (current.votacaoPautas ?? []).find((p) => p.id === voto.pautaId);
  if (!pauta) {
    return { ok: false, error: "Pauta de votação não encontrada." };
  }
  if (pauta.status !== "aberta") {
    return { ok: false, error: "Esta enquete não está aberta." };
  }

  const reabertoEm = pauta.votosReabertosEm ? new Date(pauta.votosReabertosEm).getTime() : 0;

  const votoValidoExistente = (current.votacaoVotos ?? []).some((v) => {
    if (v.pautaId !== voto.pautaId || v.cooperadoId !== voto.cooperadoId) return false;
    if (reabertoEm && new Date(v.createdAt).getTime() < reabertoEm) return false;
    return true;
  });
  if (votoValidoExistente) {
    return { ok: false, error: "Voto já registrado para este cooperado." };
  }

  const votosAtualizados = (current.votacaoVotos ?? []).filter((v) => {
    if (v.pautaId !== voto.pautaId || v.cooperadoId !== voto.cooperadoId) return true;
    if (reabertoEm && new Date(v.createdAt).getTime() < reabertoEm) return false;
    return true;
  });

  const next: OperacionalSyncPayload = {
    ...current,
    updatedAt: new Date().toISOString(),
    votacaoVotos: [...votosAtualizados, voto],
  };

  return uploadOperacionalSync(supabase, cnpj, next);
}
