/**
 * Pastas do Livro caixa — uma aba por origem (sistema + cadastrada).
 * O lançamento continua no livro inteiro e também na pasta da origem.
 */
import type { AppData, LivroCaixaLancamento, LivroCaixaOrigem, LivroCaixaOrigemCadastro } from "@/types";

export const LIVRO_CAIXA_ORIGEM_CADASTRADA: LivroCaixaOrigem = "origem_cadastrada";

export const LIVRO_CAIXA_ORIGEM_LABELS: Record<LivroCaixaOrigem, string> = {
  manual: "Manual",
  mensalidade: "Mensalidade (PIX)",
  mensalidade_ficha: "Mensalidade na ficha",
  taxa_cooperativa: "Taxa cooperativa (5%)",
  desconto_ficha: "Desconto retido na ficha",
  pagamento_cooperado: "Pagamento cooperado / ficha",
  credito_avulso: "Crédito avulso",
  debito_avulso: "Débito avulso",
  pnae: "PNAE / contrato",
  prestacao_contas: "Prestação de contas",
  hb_app_repasse: "Repasse HB Créditos",
  origem_cadastrada: "Origem cadastrada",
  outro: "Outro",
};

export type LivroCaixaPastaKey = `sys:${LivroCaixaOrigem}` | `cad:${string}`;

export type LivroCaixaPasta = {
  key: LivroCaixaPastaKey;
  nome: string;
  quantidade: number;
};

export function listarOrigensCadastroCooperativa(
  data: AppData,
  cooperativaId: string
): LivroCaixaOrigemCadastro[] {
  return (data.livroCaixaOrigensCadastro ?? [])
    .filter((o) => o.cooperativaId === cooperativaId && o.nome.trim())
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function cadastrarOrigemLivroCaixa(
  data: AppData,
  input: { id: string; cooperativaId: string; nome: string }
): AppData {
  const nome = input.nome.trim();
  if (!nome || !input.cooperativaId) return data;
  const ja = (data.livroCaixaOrigensCadastro ?? []).some(
    (o) => o.cooperativaId === input.cooperativaId && o.nome.toLowerCase() === nome.toLowerCase()
  );
  if (ja) return data;
  const item: LivroCaixaOrigemCadastro = {
    id: input.id,
    cooperativaId: input.cooperativaId,
    nome,
    createdAt: new Date().toISOString(),
  };
  return { ...data, livroCaixaOrigensCadastro: [item, ...(data.livroCaixaOrigensCadastro ?? [])] };
}

export function pastaKeyDeLancamento(l: LivroCaixaLancamento): LivroCaixaPastaKey {
  if (l.origemCadastroId?.trim()) return `cad:${l.origemCadastroId.trim()}`;
  return `sys:${l.origem}`;
}

export function lancamentoPertencePasta(l: LivroCaixaLancamento, pasta: LivroCaixaPastaKey): boolean {
  return pastaKeyDeLancamento(l) === pasta;
}

export function filtrarLancamentosPorPasta(
  lancamentos: readonly LivroCaixaLancamento[],
  pasta: LivroCaixaPastaKey | null
): LivroCaixaLancamento[] {
  if (!pasta) return [...lancamentos];
  return lancamentos.filter((l) => lancamentoPertencePasta(l, pasta));
}

export function rotuloOrigemLancamento(
  l: LivroCaixaLancamento,
  cadastro: readonly LivroCaixaOrigemCadastro[]
): string {
  if (l.origemCadastroId) {
    const nome = cadastro.find((c) => c.id === l.origemCadastroId)?.nome.trim();
    if (nome) return nome;
  }
  return LIVRO_CAIXA_ORIGEM_LABELS[l.origem] ?? l.origem;
}

export function listarPastasLivroCaixa(
  data: AppData,
  cooperativaId: string,
  lancamentosVisao: readonly LivroCaixaLancamento[] = []
): LivroCaixaPasta[] {
  const counts = new Map<LivroCaixaPastaKey, number>();
  for (const l of lancamentosVisao) {
    const key = pastaKeyDeLancamento(l);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const pastas: LivroCaixaPasta[] = [];
  for (const cad of listarOrigensCadastroCooperativa(data, cooperativaId)) {
    const key: LivroCaixaPastaKey = `cad:${cad.id}`;
    pastas.push({ key, nome: cad.nome, quantidade: counts.get(key) ?? 0 });
  }
  const sistemas = new Set<LivroCaixaOrigem>();
  for (const l of lancamentosVisao) {
    if (!l.origemCadastroId) sistemas.add(l.origem);
  }
  for (const origem of [...sistemas].sort()) {
    pastas.push({
      key: `sys:${origem}`,
      nome: LIVRO_CAIXA_ORIGEM_LABELS[origem] ?? origem,
      quantidade: counts.get(`sys:${origem}`) ?? 0,
    });
  }
  return pastas;
}

export function nomePastaLivroCaixa(
  data: AppData,
  cooperativaId: string,
  pasta: LivroCaixaPastaKey
): string {
  if (pasta.startsWith("cad:")) {
    const id = pasta.slice(4);
    return listarOrigensCadastroCooperativa(data, cooperativaId).find((c) => c.id === id)?.nome ?? "Origem";
  }
  const origem = pasta.slice(4) as LivroCaixaOrigem;
  return LIVRO_CAIXA_ORIGEM_LABELS[origem] ?? origem;
}
