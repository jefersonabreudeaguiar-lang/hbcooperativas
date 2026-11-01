import type { ContratosSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";

/** Um aparelho sem catálogo não pode apagar preços publicados por outro. */
export function publicacaoContratosApagariaItens(
  existing: ContratosSyncPayload | null,
  incoming: ContratosSyncPayload
): boolean {
  if (!existing) return false;
  if (!Array.isArray(incoming.instituicoes) || !Array.isArray(incoming.produtosInstituicao)) return true;
  const excluidas = new Set((incoming.instituicoesExcluidas ?? []).map((i) => i.id));
  const tinhaItens = existing.produtosInstituicao.some(
    (p) => p.ativo && p.precoUnitario > 0 && !excluidas.has(p.instituicaoId)
  );
  return tinhaItens && incoming.produtosInstituicao.length === 0;
}
