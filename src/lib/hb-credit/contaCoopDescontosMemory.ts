import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { dedupeDescontosContaCoopRemotos } from "@/lib/hb-credit/mergeFichaDescontos";

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
  store.set(key(cooperativaId, cooperadoId, mesReferencia), dedupeDescontosContaCoopRemotos(descontos));
}

export function getContaCoopDescontosMemoria(
  cooperativaId: string,
  cooperadoId: string,
  mesReferencia: string
): DescontoContaCoopRemoto[] {
  return store.get(key(cooperativaId, cooperadoId, mesReferencia)) ?? [];
}

export function mergeContaCoopDescontosArquivoEMemoria(
  arquivo: DescontoContaCoopRemoto[],
  memoria: DescontoContaCoopRemoto[]
): DescontoContaCoopRemoto[] {
  return dedupeDescontosContaCoopRemotos([...arquivo, ...memoria]);
}
