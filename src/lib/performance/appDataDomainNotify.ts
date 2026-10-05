/**
 * HX 8.3 — revisões por domínio (notify seletivo; paridade com dataRevision global).
 */
import type { AppData } from "@/types";

export type AppDataNotifyDomain = "shell" | "notas" | "financeiro" | "operacional";

const DOMAIN_ORDER: AppDataNotifyDomain[] = ["shell", "notas", "financeiro", "operacional"];

const domainRevision: Record<AppDataNotifyDomain, number> = {
  shell: 0,
  notas: 0,
  financeiro: 0,
  operacional: 0,
};

type DomainListener = () => void;
const domainListeners = new Map<AppDataNotifyDomain, Set<DomainListener>>();

export const APP_DATA_DOMAIN_REV_STORAGE_KEY = "coopeagriplla_domain_rev";

export function getAppDataDomainRevision(domain: AppDataNotifyDomain): number {
  return domainRevision[domain];
}

export function getAppDataDomainRevisions(): Record<AppDataNotifyDomain, number> {
  return { ...domainRevision };
}

export function subscribeAppDataDomain(domain: AppDataNotifyDomain, listener: DomainListener): () => void {
  let set = domainListeners.get(domain);
  if (!set) {
    set = new Set();
    domainListeners.set(domain, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

function notifyDomain(domain: AppDataNotifyDomain): void {
  const set = domainListeners.get(domain);
  if (!set) return;
  for (const l of set) l();
}

function persistDomainRevisionsShardHint(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(APP_DATA_DOMAIN_REV_STORAGE_KEY, JSON.stringify(getAppDataDomainRevisions()));
  } catch {
    /* quota */
  }
}

export function touchAppDataDomains(domains: Iterable<AppDataNotifyDomain>): void {
  const touched = new Set<AppDataNotifyDomain>();
  for (const d of domains) touched.add(d);
  if (!touched.size) return;
  for (const d of touched) {
    domainRevision[d] += 1;
    notifyDomain(d);
  }
  persistDomainRevisionsShardHint();
}

function arrayTouched<T>(before: T[] | undefined, after: T[] | undefined): boolean {
  if (before === after) return false;
  if ((before?.length ?? 0) !== (after?.length ?? 0)) return true;
  return before !== after;
}

/** Heurística barata — quais domínios mudaram entre snapshots AppData. */
export function inferAppDataDomainsTouched(before: AppData, after: AppData): AppDataNotifyDomain[] {
  const out = new Set<AppDataNotifyDomain>();
  if (
    before.config !== after.config ||
    before.cooperativas !== after.cooperativas ||
    before.cooperados !== after.cooperados ||
    before.users !== after.users ||
    before.instituicoes !== after.instituicoes ||
    before.produtosInstituicao !== after.produtosInstituicao
  ) {
    out.add("shell");
  }
  if (
    arrayTouched(before.notasPedido, after.notasPedido) ||
    arrayTouched(before.notasPedidoExcluidas, after.notasPedidoExcluidas)
  ) {
    out.add("notas");
  }
  if (
    arrayTouched(before.fichaCorrida, after.fichaCorrida) ||
    arrayTouched(before.pagamentosCooperado, after.pagamentosCooperado) ||
    arrayTouched(before.arquivosMensais, after.arquivosMensais) ||
    arrayTouched(before.mensalidades, after.mensalidades) ||
    arrayTouched(before.descontos, after.descontos) ||
    arrayTouched(before.pagamentos, after.pagamentos) ||
    arrayTouched(before.financeiro, after.financeiro) ||
    arrayTouched(before.livroCaixa, after.livroCaixa) ||
    arrayTouched(before.fechamentos, after.fechamentos)
  ) {
    out.add("financeiro");
  }
  if (
    arrayTouched(before.comunicados, after.comunicados) ||
    arrayTouched(before.prestacoesContas, after.prestacoesContas) ||
    arrayTouched(before.entregas, after.entregas) ||
    arrayTouched(before.cotas, after.cotas) ||
    before.livroCaixaControleAnual !== after.livroCaixaControleAnual
  ) {
    out.add("operacional");
  }
  if (!out.size) out.add("shell");
  return DOMAIN_ORDER.filter((d) => out.has(d));
}

/** Testes — reset estado in-memory. */
export function resetAppDataDomainNotifyForTests(): void {
  for (const d of DOMAIN_ORDER) {
    domainRevision[d] = 0;
    domainListeners.get(d)?.clear();
  }
}
