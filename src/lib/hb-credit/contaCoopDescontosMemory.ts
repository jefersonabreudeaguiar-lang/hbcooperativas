import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { dedupeDescontosContaCoopRemotos } from "@/lib/hb-credit/mergeFichaDescontos";
import { bumpContaCoopDescontosRevision } from "@/lib/hb-credit/contaCoopDescontosNotify";

/** Cache em memória (sessão) — fonte Supabase entre syncs do arquivo mensal. */
const store = new Map<string, DescontoContaCoopRemoto[]>();

function key(cooperativaId: string, cooperadoId: string, mesReferencia: string): string {
  return `${cooperativaId}|${cooperadoId}|${mesReferencia}`;
}

export function setContaCoopDescontosMemoria(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string,
  descontos: DescontoContaCoopRemoto[]
): void {
  const k = key(cooperativaId, cooperadoId, mesReferencia);
  const next = dedupeDescontosContaCoopRemotos(descontos);
  const prev = store.get(k);
  const prevJson = prev ? JSON.stringify(prev) : "";
  const nextJson = JSON.stringify(next);
  if (prevJson === nextJson) return;
  store.set(k, next);
  bumpContaCoopDescontosRevision();
}

export function getContaCoopDescontosMemoria(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string
): DescontoContaCoopRemoto[] {
  return store.get(key(cooperativaId, cooperadoId, mesReferencia)) ?? [];
}

export function hasContaCoopDescontosMemoria(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  return store.has(key(cooperativaId, cooperadoId, mesReferencia));
}

export function mergeContaCoopDescontosArquivoEMemoria(
  arquivo: DescontoContaCoopRemoto[],
  memoria: DescontoContaCoopRemoto[]
): DescontoContaCoopRemoto[] {
  return dedupeDescontosContaCoopRemotos([...arquivo, ...memoria]);
}
