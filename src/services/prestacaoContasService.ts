import type {
  AppData,
  PrestacaoContas,
  PrestacaoContasNota,
  PrestacaoContasStatus,
  TipoRepassePrestacao,
} from "@/types";

export const TIPO_REPASSE_LABELS: Record<TipoRepassePrestacao, string> = {
  despesa: "Despesa",
  emprestimo: "Empréstimo",
  ajuda_custo: "Ajuda de custo",
  diversos: "Diversos",
};

export function prestacoesDoCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): PrestacaoContas[] {
  return (data.prestacoesContas ?? [])
    .filter((p) => p.cooperadoId === cooperadoId && (!cooperativaId || p.cooperativaId === cooperativaId))
    .map(normalizarPrestacaoContas)
    .sort((a, b) => prestacaoTime(b, "created") - prestacaoTime(a, "created"));
}

export function prestacoesAtivasCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): PrestacaoContas[] {
  return prestacoesDoCooperado(data, cooperadoId, cooperativaId).filter((p) => p.status !== "conferida");
}

export function prestacoesCooperativa(data: AppData, cooperativaId: string): PrestacaoContas[] {
  return (data.prestacoesContas ?? [])
    .filter((p) => p.cooperativaId === cooperativaId)
    .map(normalizarPrestacaoContas)
    .sort((a, b) => prestacaoTime(b, "updated") - prestacaoTime(a, "updated"));
}

export function valorRestantePrestacao(p: PrestacaoContas): number {
  return Math.max(0, Math.round((p.valorRepasse - p.valorConferido) * 100) / 100);
}

function prestacaoTime(p: PrestacaoContas, prefer: "updated" | "created"): number {
  const raw =
    prefer === "updated"
      ? p.updatedAt ?? p.createdAt ?? p.enviadoEm
      : p.createdAt ?? p.enviadoEm ?? p.updatedAt;
  return raw ? new Date(raw).getTime() : 0;
}

/** Garante campos obrigatórios após sync ou dados antigos. */
export function normalizarPrestacaoContas(p: PrestacaoContas): PrestacaoContas {
  const now = new Date().toISOString();
  const notas = (p.notas ?? []).map((n) => ({
    ...n,
    conferido: n.conferido ?? false,
    enviadoEm: n.enviadoEm ?? now,
  }));
  const base: PrestacaoContas = {
    ...p,
    notas,
    valorRepasse: Number(p.valorRepasse) || 0,
    valorConferido: Number(p.valorConferido) || 0,
    createdAt: p.createdAt ?? p.enviadoEm ?? now,
    updatedAt: p.updatedAt ?? p.createdAt ?? p.enviadoEm ?? now,
    status: p.status ?? "pendente",
  };
  return { ...base, status: calcularStatusPrestacao(base) };
}

export function calcularStatusPrestacao(p: PrestacaoContas): PrestacaoContasStatus {
  const restante = valorRestantePrestacao(p);
  if (restante <= 0 && p.valorConferido > 0) return "conferida";
  if (p.valorConferido > 0 && restante > 0) return "parcial";
  if ((p.notas ?? []).some((n) => n.fotoDataUrl || n.fotoMiniatura)) return "em_conferencia";
  return "pendente";
}

export function criarPrestacaoContas(
  data: AppData,
  input: {
    id: string;
    cooperativaId: string;
    cooperadoId: string;
    cooperadoNome: string;
    tipoRepasse: TipoRepassePrestacao;
    historico: string;
    valorRepasse: number;
    responsavelId: string;
    responsavelNome: string;
  }
): AppData {
  const now = new Date().toISOString();
  const prestacao: PrestacaoContas = {
    id: input.id,
    cooperativaId: input.cooperativaId,
    cooperadoId: input.cooperadoId,
    cooperadoNomeSnapshot: input.cooperadoNome,
    tipoRepasse: input.tipoRepasse,
    historico: input.historico.trim(),
    valorRepasse: input.valorRepasse,
    valorConferido: 0,
    status: "pendente",
    notas: [],
    enviadoEm: now,
    responsavelId: input.responsavelId,
    responsavelNome: input.responsavelNome,
    createdAt: now,
    updatedAt: now,
  };
  return { ...data, prestacoesContas: [prestacao, ...(data.prestacoesContas ?? [])] };
}

export function adicionarNotasPrestacao(
  data: AppData,
  prestacaoId: string,
  notas: PrestacaoContasNota[]
): AppData {
  return {
    ...data,
    prestacoesContas: (data.prestacoesContas ?? []).map((p) => {
      if (p.id !== prestacaoId) return p;
      const merged = [...(p.notas ?? []), ...notas];
      const next = { ...p, notas: merged, updatedAt: new Date().toISOString() };
      return { ...next, status: calcularStatusPrestacao(next) };
    }),
  };
}

export function atualizarNotaPrestacao(
  data: AppData,
  prestacaoId: string,
  notaId: string,
  patch: Partial<Pick<PrestacaoContasNota, "valorNota" | "dataNota" | "localDespesa">>
): AppData {
  return {
    ...data,
    prestacoesContas: (data.prestacoesContas ?? []).map((p) => {
      if (p.id !== prestacaoId) return p;
      const notas = (p.notas ?? []).map((n) => (n.id === notaId ? { ...n, ...patch } : n));
      return { ...p, notas, updatedAt: new Date().toISOString() };
    }),
  };
}

export function conferirNotaPrestacao(data: AppData, prestacaoId: string, notaId: string): AppData {
  const now = new Date().toISOString();
  return {
    ...data,
    prestacoesContas: (data.prestacoesContas ?? []).map((p) => {
      if (p.id !== prestacaoId) return p;
      let valorConferido = p.valorConferido;
      const notas = (p.notas ?? []).map((n) => {
        if (n.id !== notaId || n.conferido) return n;
        const valor = Number(n.valorNota) || 0;
        valorConferido += valor;
        return { ...n, conferido: true, conferidoEm: now };
      });
      const next: PrestacaoContas = {
        ...p,
        notas,
        valorConferido: Math.round(valorConferido * 100) / 100,
        updatedAt: now,
      };
      return { ...next, status: calcularStatusPrestacao(next) };
    }),
  };
}

export function prestacaoPrincipalCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): PrestacaoContas | undefined {
  return prestacoesAtivasCooperado(data, cooperadoId, cooperativaId)[0];
}
