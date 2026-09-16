import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeDescontosContaCoopRemotos, type DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "@/lib/supabase/contaCoopStorage";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";
import type { ArquivoMensalCooperado } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function descontosToArquivo(descontos: DescontoContaCoopRemoto[]): NonNullable<ArquivoMensalCooperado["contaCoopDescontos"]> {
  return descontos.map((d) => ({
    motivo: d.motivo,
    valorReais: d.valorReais,
    tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
    createdAt: d.createdAt,
  }));
}

function descontosFingerprint(descontos: DescontoContaCoopRemoto[]): string {
  return JSON.stringify(
    dedupeDescontosContaCoopRemotos(descontos).map((d) => ({
      motivo: d.motivo,
      valorReais: round2(d.valorReais),
      createdAt: d.createdAt,
    }))
  );
}

function arquivoDescontosFingerprint(arquivo: ArquivoMensalCooperado | undefined): string {
  const rows: DescontoContaCoopRemoto[] = (arquivo?.contaCoopDescontos ?? []).map((d) => ({
    motivo: d.motivo,
    valorReais: d.valorReais,
    tipo: "conta_coop",
    createdAt: d.createdAt,
  }));
  return descontosFingerprint(rows);
}

function mesesPendentesOperacional(
  op: OperacionalSyncPayload,
  cooperadoId?: string
): Array<{ cooperadoId: string; mesReferencia: string; cooperativaId: string }> {
  const seen = new Set<string>();
  const jobs: Array<{ cooperadoId: string; mesReferencia: string; cooperativaId: string }> = [];
  for (const f of op.fichaCorrida ?? []) {
    if (f.status !== "pendente" || !f.cooperadoId || !f.mesReferencia) continue;
    if (cooperadoId && f.cooperadoId !== cooperadoId) continue;
    const k = `${f.cooperadoId}|${f.mesReferencia}`;
    if (seen.has(k)) continue;
    seen.add(k);
    jobs.push({
      cooperadoId: f.cooperadoId,
      mesReferencia: f.mesReferencia,
      cooperativaId: f.cooperativaId ?? "",
    });
  }
  return jobs.sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));
}

async function patchOperacionalDescontos(
  supabase: SupabaseClient,
  cnpj: string,
  op: OperacionalSyncPayload,
  jobs: Array<{ cooperadoId: string; mesReferencia: string; cooperativaId: string }>
): Promise<{ patched: number; checked: number }> {
  const digits = normalizeCnpj(cnpj);
  let patched = 0;
  const hbSyncedAt = new Date().toISOString();
  const arquivos = [...(op.arquivosMensais ?? [])];

  for (const job of jobs) {
    const remote = await listCooperadoContaCoopDescontosAbateValorReceber(
      supabase,
      digits,
      job.cooperadoId,
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

  let jobs = mesesPendentesOperacional(op, cooperadoId);
  if (opts?.mesReferencia) {
    jobs = jobs.filter((j) => j.mesReferencia === opts.mesReferencia);
    if (!jobs.length) {
      jobs = [{ cooperadoId, mesReferencia: opts.mesReferencia, cooperativaId: "" }];
    }
  }
  if (!jobs.length) return { patched: 0, checked: 0 };

  return patchOperacionalDescontos(supabase, digits, op, jobs);
}

/** Reconcilia operacional.json × HB para todos os cooperados com ficha pendente. */
export async function repairOperacionalContaCoopDescontosCooperativa(
  supabase: SupabaseClient,
  cnpj: string
): Promise<{ patched: number; checked: number }> {
  const digits = normalizeCnpj(cnpj);
  const op = await fetchOperacionalSync(supabase, digits);
  if (!op) return { patched: 0, checked: 0 };

  const jobs = mesesPendentesOperacional(op);
  if (!jobs.length) return { patched: 0, checked: 0 };

  return patchOperacionalDescontos(supabase, digits, op, jobs);
}
