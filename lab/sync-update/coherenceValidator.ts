/**
 * Validações de coerência pós-merge — lab.
 * Espelha regras de fichaSyncGuard + invariantes conhecidos.
 */
import type { CoherenceIssue } from "./types";

export interface FichaRow {
  cooperadoId: string;
  mesReferencia: string;
  valor: number;
  status: "aberto" | "pago" | "cancelado";
}

export interface PagamentoRow {
  id: string;
  cooperadoId: string;
  valor: number;
  mesReferencia: string;
}

export interface MensalidadeRow {
  cooperadoId: string;
  mesReferencia: string;
  valor: number;
}

export interface OperacionalSnapshot {
  fichas: FichaRow[];
  pagamentos: PagamentoRow[];
  mensalidades: MensalidadeRow[];
}

function dupKeyFicha(f: FichaRow): string {
  return `${f.cooperadoId}|${f.mesReferencia}`;
}

/** Detecta duplicatas e desalinhamento pagamento vs ficha. */
export function validateCoherence(snap: OperacionalSnapshot): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  const fichaKeys = new Map<string, number>();
  for (const f of snap.fichas) {
    const k = dupKeyFicha(f);
    fichaKeys.set(k, (fichaKeys.get(k) ?? 0) + 1);
  }
  for (const [k, n] of fichaKeys) {
    if (n > 1) {
      issues.push({
        code: "FICHA_DUPLICATE",
        severity: "block",
        message: `Ficha duplicada: ${k} (${n}x)`,
      });
    }
  }

  const fichaPaid = new Map<string, number>();
  for (const f of snap.fichas) {
    if (f.status === "pago") {
      fichaPaid.set(dupKeyFicha(f), f.valor);
    }
  }

  const pagByCoopMes = new Map<string, number>();
  for (const p of snap.pagamentos) {
    const k = `${p.cooperadoId}|${p.mesReferencia}`;
    pagByCoopMes.set(k, (pagByCoopMes.get(k) ?? 0) + p.valor);
  }

  for (const [k, paidFicha] of fichaPaid) {
    const paidPag = pagByCoopMes.get(k) ?? 0;
    if (Math.abs(paidFicha - paidPag) > 0.01 && paidPag > 0) {
      issues.push({
        code: "FICHA_PAYMENT_MISMATCH",
        severity: "warn",
        message: `Ficha paga ≠ soma pagamentos: ${k}`,
      });
    }
  }

  for (const m of snap.mensalidades) {
    const k = `${m.cooperadoId}|${m.mesReferencia}`;
    const ficha = snap.fichas.find(
      (f) => f.cooperadoId === m.cooperadoId && f.mesReferencia === m.mesReferencia
    );
    if (ficha && Math.abs(ficha.valor - m.valor) > 0.01) {
      issues.push({
        code: "MENSALIDADE_FICHA_DRIFT",
        severity: "warn",
        message: `Mensalidade ≠ ficha: ${k}`,
      });
    }
  }

  return issues;
}

export function wouldBlockPush(issues: CoherenceIssue[]): boolean {
  return issues.some((i) => i.severity === "block");
}

/** Gera snapshot sintético limpo para simulação. */
export function syntheticCleanSnapshot(cooperados: number, meses: number): OperacionalSnapshot {
  const fichas: FichaRow[] = [];
  const pagamentos: PagamentoRow[] = [];
  const mensalidades: MensalidadeRow[] = [];

  for (let c = 1; c <= cooperados; c++) {
    const id = `coop-${c}`;
    for (let m = 1; m <= meses; m++) {
      const mes = `2026-${String(m).padStart(2, "0")}`;
      const valor = 50 + (c % 10);
      fichas.push({ cooperadoId: id, mesReferencia: mes, valor, status: "aberto" });
      mensalidades.push({ cooperadoId: id, mesReferencia: mes, valor });
    }
  }

  return { fichas, pagamentos, mensalidades };
}

/** Injeta erro típico de produção (duplicata ficha). */
export function injectDuplicateFicha(snap: OperacionalSnapshot): OperacionalSnapshot {
  if (snap.fichas.length === 0) return snap;
  return {
    ...snap,
    fichas: [...snap.fichas, { ...snap.fichas[0] }],
  };
}
