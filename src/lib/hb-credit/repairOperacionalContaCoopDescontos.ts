import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeDescontosContaCoopRemotos, type DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "@/lib/supabase/contaCoopStorage";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";
import { fetchAllCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import type { ArquivoMensalCooperado, Cooperado, PagamentoCooperadoRegistro } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function descontosToArquivo(descontos: DescontoContaCoopRemoto[]): NonNullable<ArquivoMensalCooperado["contaCoopDescontos"]> {
  return descontos.map((d) => ({
    motivo: d.motivo,
    valorReais: d.valorReais,
    tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
    createdAt: d.createdAt ?? "",
  }));
}

function descontosFingerprint(descontos: DescontoContaCoopRemoto[]): string {
  return JSON.stringify(
    dedupeDescontosContaCoopRemotos(descontos).map((d) => ({
      motivo: d.motivo,
      valorReais: round2(d.valorReais),
      createdAt: d.createdAt ?? "",
    }))
  );
}

function arquivoDescontosFingerprint(arquivo: ArquivoMensalCooperado | undefined): string {
  const rows: DescontoContaCoopRemoto[] = (arquivo?.contaCoopDescontos ?? []).map((d) => ({
    motivo: d.motivo,
    valorReais: d.valorReais,
    tipo: "conta_coop",
    createdAt: d.createdAt ?? "",
  }));
  return descontosFingerprint(rows);
}

function cpfDigits(cpf?: string): string {
  return (cpf ?? "").replace(/\D/g, "");
}

function nomeNorm(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Mesmo titular (CPF/nome) — compras HB podem estar em ID duplicado. */
export function titularCooperadoIds(cooperados: Cooperado[], cooperadoId: string): string[] {
  const ids = new Set<string>([cooperadoId]);
  const ref = cooperados.find((c) => c.id === cooperadoId);
  if (!ref) return [...ids];
  const cpf = cpfDigits(ref.cpfCnpj);
  const nome = nomeNorm(ref.nomeCompleto);
  for (const c of cooperados) {
    if (cpf.length >= 11 && cpfDigits(c.cpfCnpj) === cpf) ids.add(c.id);
    else if (nome && nomeNorm(c.nomeCompleto) === nome) ids.add(c.id);
  }
  return [...ids];
}

function mesesPagamentoOp(p: PagamentoCooperadoRegistro): string[] {
  if (p.mesesReferencia?.length) return [...p.mesesReferencia].sort();
  return [p.mesReferencia];
}

/** Meses em aberto que devem refletir compras HB na ficha (nuvem). */
export function collectContaCoopSyncJobs(
  op: OperacionalSyncPayload,
  cooperadoIdFilter?: string
): Array<{ cooperadoId: string; mesReferencia: string; cooperativaId: string }> {
  const map = new Map<string, { cooperadoId: string; mesReferencia: string; cooperativaId: string }>();
  const add = (cooperadoId: string, mesReferencia: string, cooperativaId: string) => {
    if (!cooperadoId?.trim() || !mesReferencia?.trim()) return;
    if (cooperadoIdFilter && cooperadoId !== cooperadoIdFilter) return;
    const k = `${cooperadoId}|${mesReferencia}`;
    if (!map.has(k)) {
      map.set(k, { cooperadoId, mesReferencia, cooperativaId: cooperativaId ?? "" });
    }
  };

  for (const f of op.fichaCorrida ?? []) {
    if (f.status !== "pendente") continue;
    add(f.cooperadoId, f.mesReferencia, f.cooperativaId ?? "");
  }

  for (const p of op.pagamentosCooperado ?? []) {
    if (p.status !== "aguardando_confirmacao") continue;
    for (const mes of mesesPagamentoOp(p)) {
      add(p.cooperadoId, mes, p.cooperativaId ?? "");
    }
  }

  return [...map.values()].sort(
    (a, b) => a.mesReferencia.localeCompare(b.mesReferencia) || a.cooperadoId.localeCompare(b.cooperadoId)
  );
}

async function patchOperacionalDescontos(
  supabase: SupabaseClient,
  cnpj: string,
  op: OperacionalSyncPayload,
  jobs: Array<{ cooperadoId: string; mesReferencia: string; cooperativaId: string }>,
  cooperadosCadastro: Cooperado[]
): Promise<{ patched: number; checked: number }> {
  const digits = normalizeCnpj(cnpj);
  let patched = 0;
  const hbSyncedAt = new Date().toISOString();
  const arquivos = [...(op.arquivosMensais ?? [])];

  for (const job of jobs) {
    const titularIds = titularCooperadoIds(cooperadosCadastro, job.cooperadoId);
    const remote = await listCooperadoContaCoopDescontosAbateValorReceber(
      supabase,
      digits,
      titularIds,
      job.mesReferencia
    );
    const descontos = dedupeDescontosContaCoopRemotos(remote);
    const idx = arquivos.findIndex(
      (a) => a.cooperadoId === job.cooperadoId && a.mesReferencia === job.mesReferencia
    );
    const cur = idx >= 0 ? arquivos[idx] : undefined;
    if (descontosFingerprint(descontos) === arquivoDescontosFingerprint(cur)) continue;

    const mapped = descontosToArquivo(descontos);
    if (idx >= 0) {
      arquivos[idx] = {
        ...arquivos[idx],
        contaCoopDescontos: mapped,
        contaCoopDescontosUpdatedAt: hbSyncedAt,
        updatedAt: hbSyncedAt,
      };
    } else {
      arquivos.push({
        id: `am_${job.cooperadoId}_${job.mesReferencia}`,
        cooperadoId: job.cooperadoId,
        cooperativaId: job.cooperativaId || cur?.cooperativaId || "",
        mesReferencia: job.mesReferencia,
        notaPedidoIds: [],
        pagamentoIds: [],
        contaCoopDescontos: mapped,
        contaCoopDescontosUpdatedAt: hbSyncedAt,
        updatedAt: hbSyncedAt,
      });
    }
    patched += 1;
  }

  if (patched === 0) {
    return { patched: 0, checked: jobs.length };
  }

  const next: OperacionalSyncPayload = {
    ...op,
    updatedAt: hbSyncedAt,
    arquivosMensais: arquivos,
  };
  const up = await uploadOperacionalSync(supabase, digits, next);
  if (!up.ok) {
    throw new Error(up.error || "upload_operacional_failed");
  }
  return { patched, checked: jobs.length };
}

/** Atualiza contaCoopDescontos no operacional.json da nuvem a partir das transações HB (outros aparelhos). */
export async function repairOperacionalContaCoopDescontosForCooperado(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  opts?: { mesReferencia?: string }
): Promise<{ patched: number; checked: number }> {
  const digits = normalizeCnpj(cnpj);
  const op = await fetchOperacionalSync(supabase, digits);
  if (!op) return { patched: 0, checked: 0 };

  const cooperadosCadastro = await fetchAllCooperadosFromStorage(supabase, digits);
  let jobs = collectContaCoopSyncJobs(op, cooperadoId);
  if (opts?.mesReferencia) {
    jobs = jobs.filter((j) => j.mesReferencia === opts.mesReferencia);
    if (!jobs.length) {
      jobs = [{ cooperadoId, mesReferencia: opts.mesReferencia, cooperativaId: "" }];
    }
  }
  if (!jobs.length) return { patched: 0, checked: 0 };

  return patchOperacionalDescontos(supabase, digits, op, jobs, cooperadosCadastro);
}

/** Reconcilia operacional.json × HB para todos os cooperados com ficha pendente. */
export async function repairOperacionalContaCoopDescontosCooperativa(
  supabase: SupabaseClient,
  cnpj: string
): Promise<{ patched: number; checked: number }> {
  const digits = normalizeCnpj(cnpj);
  const op = await fetchOperacionalSync(supabase, digits);
  if (!op) return { patched: 0, checked: 0 };

  const cooperadosCadastro = await fetchAllCooperadosFromStorage(supabase, digits);
  const jobs = collectContaCoopSyncJobs(op);
  if (!jobs.length) return { patched: 0, checked: 0 };

  return patchOperacionalDescontos(supabase, digits, op, jobs, cooperadosCadastro);
}
