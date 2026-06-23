import type { AppData, InstituicaoExcluida } from "@/types";
import { removerCronogramasInstituicao } from "@/services/cronogramaContratoService";

export function idsInstituicoesExcluidas(data: AppData, cooperativaId?: string): Set<string> {
  return new Set(
    (data.instituicoesExcluidas ?? [])
      .filter((e) => !cooperativaId || e.cooperativaId === cooperativaId)
      .map((e) => e.id)
  );
}

/** Remove instituições e produtos marcados como excluídos (sync e UI usam a mesma base). */
export function aplicarInstituicoesExcluidas(data: AppData): AppData {
  const excluidas = idsInstituicoesExcluidas(data);
  if (excluidas.size === 0) return data;

  const instituicoes = data.instituicoes.filter((i) => !excluidas.has(i.id));
  const produtosInstituicao = data.produtosInstituicao.filter((p) => !excluidas.has(p.instituicaoId));

  if (
    instituicoes.length === data.instituicoes.length &&
    produtosInstituicao.length === data.produtosInstituicao.length
  ) {
    return data;
  }

  return { ...data, instituicoes, produtosInstituicao };
}

export function excluirInstituicaoContrato(
  data: AppData,
  instituicaoId: string,
  cooperativaId?: string
): AppData {
  const alvo = data.instituicoes.find(
    (i) => i.id === instituicaoId && (cooperativaId == null || i.cooperativaId === cooperativaId)
  );
  const now = new Date().toISOString();
  const excluidas = [...(data.instituicoesExcluidas ?? [])];

  if (alvo) {
    const tombstone: InstituicaoExcluida = {
      id: instituicaoId,
      cooperativaId: alvo.cooperativaId,
      deletedAt: now,
    };
    const idx = excluidas.findIndex((e) => e.id === instituicaoId);
    if (idx >= 0) excluidas[idx] = tombstone;
    else excluidas.push(tombstone);
  }

  return aplicarInstituicoesExcluidas(
    removerCronogramasInstituicao(
      {
        ...data,
        instituicoes: data.instituicoes.filter(
          (i) => i.id !== instituicaoId || (cooperativaId != null && i.cooperativaId !== cooperativaId)
        ),
        produtosInstituicao: data.produtosInstituicao.filter(
          (p) => p.instituicaoId !== instituicaoId || (cooperativaId != null && p.cooperativaId !== cooperativaId)
        ),
        instituicoesExcluidas: excluidas,
      },
      instituicaoId
    )
  );
}
