import type { Cooperado } from "@/types";

export function cpfCooperadoDigits(cpfCnpj?: string): string {
  return (cpfCnpj ?? "").replace(/\D/g, "");
}

export function nomeNormalizadoCooperado(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mesmoCooperadoCadastro(
  a: Pick<Cooperado, "cpfCnpj" | "nomeCompleto">,
  b: Pick<Cooperado, "cpfCnpj" | "nomeCompleto">
): boolean {
  const cpfA = cpfCooperadoDigits(a.cpfCnpj);
  const cpfB = cpfCooperadoDigits(b.cpfCnpj);
  if (cpfA.length >= 11 && cpfA === cpfB) return true;
  return nomeNormalizadoCooperado(a.nomeCompleto) === nomeNormalizadoCooperado(b.nomeCompleto);
}

function chaveDedupeCooperado(c: Pick<Cooperado, "cpfCnpj" | "nomeCompleto">): string {
  const cpf = cpfCooperadoDigits(c.cpfCnpj);
  if (cpf.length >= 11) return `cpf:${cpf}`;
  return `nome:${nomeNormalizadoCooperado(c.nomeCompleto)}`;
}

function pontuarCooperadoCanonico(c: Cooperado, loginCooperadoIds?: Set<string>): number {
  let score = 0;
  if (loginCooperadoIds?.has(c.id)) score += 1_000_000;
  if (c.status === "ativo") score += 10_000;
  if (c.status === "suspenso") score += 1_000;
  if (c.chavePix?.trim()) score += 100;
  if (c.appInstaladoEm) score += 10;
  score += Math.floor(new Date(c.updatedAt || c.createdAt || 0).getTime() / 1000);
  return score;
}

/** Mantém um cadastro por CPF (ou nome, se sem CPF). */
export function deduplicarCooperadosLista(
  cooperados: Cooperado[],
  loginCooperadoIds?: Set<string>
): Cooperado[] {
  const byKey = new Map<string, Cooperado[]>();
  for (const c of cooperados) {
    const key = chaveDedupeCooperado(c);
    if (!key || key === "nome:") continue;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const escolhidos: Cooperado[] = [];
  for (const grupo of byKey.values()) {
    escolhidos.push(
      [...grupo].sort(
        (a, b) => pontuarCooperadoCanonico(b, loginCooperadoIds) - pontuarCooperadoCanonico(a, loginCooperadoIds)
      )[0]
    );
  }

  return escolhidos.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}

/** Cooperados únicos e cobráveis (≠ desligado) para mensalidade HB. */
export function cooperadosUnicosParaCobranca(
  cooperados: Cooperado[],
  loginCooperadoIds?: Set<string>
): Cooperado[] {
  return deduplicarCooperadosLista(
    cooperados.filter((c) => c.status !== "desligado"),
    loginCooperadoIds
  );
}

/** Escolhe o cadastro canônico dentro de um grupo equivalente (mesmo CPF/nome). */
export function escolherCooperadoCanonico(
  grupo: Cooperado[],
  loginCooperadoIds?: Set<string>
): Cooperado {
  return [...grupo].sort(
    (a, b) => pontuarCooperadoCanonico(b, loginCooperadoIds) - pontuarCooperadoCanonico(a, loginCooperadoIds)
  )[0];
}

export function agruparCooperadosDuplicados(cooperados: Cooperado[]): Map<string, Cooperado[]> {
  const byKey = new Map<string, Cooperado[]>();
  for (const c of cooperados) {
    const key = chaveDedupeCooperado(c);
    if (!key || key === "nome:") continue;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }
  return new Map([...byKey.entries()].filter(([, list]) => list.length > 1));
}
