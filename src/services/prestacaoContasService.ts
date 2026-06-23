import type {
  AppData,
  PrestacaoContas,
  PrestacaoContasExcluida,
  PrestacaoContasNota,
  PrestacaoContasStatus,
  TipoRepassePrestacao,
} from "@/types";
import { round2 } from "@/utils/calculations";

export const TIPO_REPASSE_LABELS: Record<TipoRepassePrestacao, string> = {
  despesa: "Despesa",
  emprestimo: "Empréstimo",
  ajuda_custo: "Ajuda de custo",
  diversos: "Diversos",
};

function idsPrestacoesExcluidas(data: AppData, cooperativaId?: string): Set<string> {
  return new Set(
    (data.prestacoesContasExcluidas ?? [])
      .filter((e) => !cooperativaId || e.cooperativaId === cooperativaId)
      .map((e) => e.id)
  );
}

export function prestacoesDoCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): PrestacaoContas[] {
  const excluidas = idsPrestacoesExcluidas(data, cooperativaId);
  return (data.prestacoesContas ?? [])
    .filter(
      (p) =>
        !excluidas.has(p.id) &&
        p.cooperadoId === cooperadoId &&
        (!cooperativaId || p.cooperativaId === cooperativaId)
    )
    .map(normalizarPrestacaoContas)
    .sort((a, b) => prestacaoTime(b, "created") - prestacaoTime(a, "created"));
}

export function prestacoesAtivasCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): PrestacaoContas[] {
  return prestacoesDoCooperado(data, cooperadoId, cooperativaId).filter((p) => p.status !== "conferida");
}

export function prestacoesCooperativa(data: AppData, cooperativaId: string): PrestacaoContas[] {
  const excluidas = idsPrestacoesExcluidas(data, cooperativaId);
  return (data.prestacoesContas ?? [])
    .filter((p) => p.cooperativaId === cooperativaId && !excluidas.has(p.id))
    .map(normalizarPrestacaoContas)
    .sort((a, b) => prestacaoTime(b, "updated") - prestacaoTime(a, "updated"));
}

export function totalValorNotasPrestacao(p: PrestacaoContas): number {
  return round2(
    (p.notas ?? []).reduce((s, n) => s + (Number(n.valorNota) || 0), 0)
  );
}

function recalcValorConferidoNotas(notas: PrestacaoContasNota[]): number {
  return round2(
    notas.filter((n) => n.conferido).reduce((s, n) => s + (Number(n.valorNota) || 0), 0)
  );
}

/** Saldo a prestar — abate o valor informado em cada nota enviada. */
export function valorRestantePrestacao(p: PrestacaoContas): number {
  return Math.max(0, round2(p.valorRepasse - totalValorNotasPrestacao(p)));
}

export interface ResumoValoresPrestacao {
  repasse: number;
  abatido: number;
  restante: number;
  conferido: number;
  notasAguardando: number;
}

export function resumoValoresPrestacao(p: PrestacaoContas): ResumoValoresPrestacao {
  const notas = p.notas ?? [];
  const abatido = totalValorNotasPrestacao(p);
  const conferido = recalcValorConferidoNotas(notas);
  return {
    repasse: p.valorRepasse,
    abatido,
    restante: valorRestantePrestacao(p),
    conferido,
    notasAguardando: notas.filter(
      (n) => !n.conferido && Boolean(n.fotoDataUrl || n.fotoMiniatura)
    ).length,
  };
}

/** Permanece no início do cooperado até zerar e conferir todas as notas. */
export function prestacaoExigeAtencaoCooperado(p: PrestacaoContas): boolean {
  const resumo = resumoValoresPrestacao(p);
  if (calcularStatusPrestacao(p) === "conferida") return false;
  if (resumo.restante > 0) return true;
  return resumo.notasAguardando > 0;
}

export function tituloPrestacaoCooperado(p: PrestacaoContas): string {
  const resumo = resumoValoresPrestacao(p);
  if (resumo.restante <= 0 && resumo.notasAguardando > 0) {
    return "Notas enviadas — aguardando conferência";
  }
  if (resumo.conferido > 0 && resumo.restante > 0) {
    return "Falta prestar conta do restante";
  }
  if (resumo.notasAguardando > 0) {
    return "Notas enviadas — aguardando conferência";
  }
  return "Presta conta";
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
  if (!p || typeof p !== "object") {
    const now = new Date().toISOString();
    return {
      id: `pc_invalid_${Date.now()}`,
      cooperativaId: "",
      cooperadoId: "",
      tipoRepasse: "diversos",
      historico: "Repasse",
      valorRepasse: 0,
      valorConferido: 0,
      status: "pendente",
      notas: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const now = new Date().toISOString();
  const tipoRepasse =
    p.tipoRepasse && p.tipoRepasse in TIPO_REPASSE_LABELS ? p.tipoRepasse : "diversos";
  const notas = (p.notas ?? []).map((n) => ({
    ...n,
    conferido: n.conferido ?? false,
    enviadoEm: n.enviadoEm ?? now,
  }));
  const base: PrestacaoContas = {
    ...p,
    tipoRepasse,
    historico: p.historico?.trim() || "Repasse",
    notas,
    valorRepasse: Number(p.valorRepasse) || 0,
    valorConferido: recalcValorConferidoNotas(notas),
    createdAt: p.createdAt ?? p.enviadoEm ?? now,
    updatedAt: p.updatedAt ?? p.createdAt ?? p.enviadoEm ?? now,
    status: p.status ?? "pendente",
  };
  return { ...base, status: calcularStatusPrestacao(base) };
}

export function calcularStatusPrestacao(p: PrestacaoContas): PrestacaoContasStatus {
  const restante = valorRestantePrestacao(p);
  const notas = (p.notas ?? []).filter((n) => n.fotoDataUrl || n.fotoMiniatura);
  const conferido = recalcValorConferidoNotas(p.notas ?? []);

  if (
    restante <= 0 &&
    notas.length > 0 &&
    notas.every((n) => n.conferido) &&
    conferido > 0
  ) {
    return "conferida";
  }
  if (conferido > 0 && restante > 0) return "parcial";
  if (notas.length > 0) return "em_conferencia";
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
      const next = {
        ...p,
        notas: merged,
        valorConferido: recalcValorConferidoNotas(merged),
        updatedAt: new Date().toISOString(),
      };
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
      const next = {
        ...p,
        notas,
        valorConferido: recalcValorConferidoNotas(notas),
        updatedAt: new Date().toISOString(),
      };
      return { ...next, status: calcularStatusPrestacao(next) };
    }),
  };
}

export function conferirNotaPrestacao(data: AppData, prestacaoId: string, notaId: string): AppData {
  const now = new Date().toISOString();
  return {
    ...data,
    prestacoesContas: (data.prestacoesContas ?? []).map((p) => {
      if (p.id !== prestacaoId) return p;
      const notas = (p.notas ?? []).map((n) => {
        if (n.id !== notaId || n.conferido) return n;
        return { ...n, conferido: true, conferidoEm: now };
      });
      const next: PrestacaoContas = {
        ...p,
        notas,
        valorConferido: recalcValorConferidoNotas(notas),
        updatedAt: now,
      };
      return { ...next, status: calcularStatusPrestacao(next) };
    }),
  };
}

export function prestacaoPrincipalCooperado(data: AppData, cooperadoId: string, cooperativaId?: string): PrestacaoContas | undefined {
  return prestacoesAtivasCooperado(data, cooperadoId, cooperativaId)[0];
}

export function excluirPrestacaoContas(
  data: AppData,
  prestacaoId: string,
  cooperativaId?: string
): AppData {
  const alvo = (data.prestacoesContas ?? []).find(
    (p) => p.id === prestacaoId && (cooperativaId == null || p.cooperativaId === cooperativaId)
  );
  const now = new Date().toISOString();
  const excluidas = [...(data.prestacoesContasExcluidas ?? [])];
  if (alvo) {
    const tombstone: PrestacaoContasExcluida = {
      id: prestacaoId,
      cooperativaId: alvo.cooperativaId,
      deletedAt: now,
    };
    const idx = excluidas.findIndex((e) => e.id === prestacaoId);
    if (idx >= 0) excluidas[idx] = tombstone;
    else excluidas.push(tombstone);
  }
  return {
    ...data,
    prestacoesContas: (data.prestacoesContas ?? []).filter(
      (p) => p.id !== prestacaoId || (cooperativaId != null && p.cooperativaId !== cooperativaId)
    ),
    prestacoesContasExcluidas: excluidas,
  };
}
