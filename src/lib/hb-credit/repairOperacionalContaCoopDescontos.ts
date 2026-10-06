import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeDescontosContaCoopRemotos,
  descontosContaCoopFromArquivo,
  liquidoUsoContaCoopMes,
  type DescontoContaCoopRemoto,
} from "@/lib/hb-credit/mergeFichaDescontos";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "@/lib/supabase/contaCoopStorage";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";
import { fetchAllCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import type { AppData, ArquivoMensalCooperado, Cooperado, PagamentoCooperadoRegistro } from "@/types";
import { mesesReferenciaComDebitoAberto } from "@/services/notaPedidoService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { isHbFichaBaseProjectionLegacy } from "@/lib/hb-credit/hbFichaBaseOperacional";
import { normalizeCnpj } from "@/utils/cooperativa";
import { titularCooperadoIds } from "@/lib/hb-credit/hbCreditLimiteTitularPick";

export { titularCooperadoIds } from "@/lib/hb-credit/hbCreditLimiteTitularPick";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function descontosToArquivo(descontos: DescontoContaCoopRemoto[]): NonNullable<ArquivoMensalCooperado["contaCoopDescontos"]> {
  return descontos.map((d) => ({
    motivo: d.motivo,
    valorReais: d.valorReais,
    tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
    createdAt: d.createdAt ?? "",
    ...(d.hbTransactionId ? { hbTransactionId: d.hbTransactionId } : {}),
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
    const coop = cooperativaId ?? "";
    if (map.has(k)) {
      const cur = map.get(k)!;
      if (!cur.cooperativaId && coop) cur.cooperativaId = coop;
      return;
    }
    map.set(k, { cooperadoId, mesReferencia, cooperativaId: coop });
  };

  const mesComPagamentoConfirmado = (cooperadoId: string, mes: string): boolean =>
    (op.pagamentosCooperado ?? []).some(
      (p) =>
        p.cooperadoId === cooperadoId &&
        p.status === "confirmado" &&
        mesesPagamentoOp(p).includes(mes)
    );

  for (const f of op.fichaCorrida ?? []) {
    if (f.status === "pendente") {
      add(f.cooperadoId, f.mesReferencia, f.cooperativaId ?? "");
      continue;
    }
    if (f.status === "pago" && !mesComPagamentoConfirmado(f.cooperadoId, f.mesReferencia)) {
      add(f.cooperadoId, f.mesReferencia, f.cooperativaId ?? "");
    }
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

/**
 * Escopo financeiro real (mesma base do resumo / pagamento) — inclui fichas reconciliadas
 * a partir de notas quando o operacional.json não traz fichaCorrida completa.
 */
export function collectContaCoopSyncJobsFromAppData(
  data: AppData,
  cooperativaId: string,
  cooperadoIdFilter?: string
): Array<{ cooperadoId: string; mesReferencia: string; cooperativaId: string }> {
  const opPayload = {
    updatedAt: "",
    arquivosMensais: data.arquivosMensais ?? [],
    pagamentosCooperado: data.pagamentosCooperado ?? [],
    fichaCorrida: data.fichaCorrida ?? [],
    comunicados: data.comunicados ?? [],
    mensalidades: data.mensalidades ?? [],
    descontos: data.descontos ?? [],
    config: data.config ?? { descontoPadraoCooperativa: 5 },
  };

  if (isHbFichaBaseProjectionLegacy()) {
    return collectContaCoopSyncJobs(opPayload, cooperadoIdFilter);
  }

  const map = new Map<string, { cooperadoId: string; mesReferencia: string; cooperativaId: string }>();
  const add = (cooperadoId: string, mesReferencia: string) => {
    if (!cooperadoId?.trim() || !mesReferencia?.trim()) return;
    const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
    if (cooperadoIdFilter && cooperadoId !== cooperadoIdFilter && canon !== cooperadoIdFilter) return;
    const k = `${canon}|${mesReferencia}`;
    if (!map.has(k)) {
      map.set(k, { cooperadoId: canon, mesReferencia, cooperativaId });
    }
  };

  for (const c of data.cooperados) {
    if (c.cooperativaId && c.cooperativaId !== cooperativaId) continue;
    for (const mes of mesesReferenciaComDebitoAberto(data, c.id, cooperativaId)) {
      add(c.id, mes);
    }
  }

  const opJobs = collectContaCoopSyncJobs(opPayload, cooperadoIdFilter);
  for (const j of opJobs) {
    add(j.cooperadoId, j.mesReferencia);
  }

  return [...map.values()].sort(
    (a, b) => a.mesReferencia.localeCompare(b.mesReferencia) || a.cooperadoId.localeCompare(b.cooperadoId)
  );
}

export type ContaCoopSyncJob = { cooperadoId: string; mesReferencia: string; cooperativaId: string };

async function previewJobs(
  supabase: SupabaseClient,
  cnpj: string,
  jobs: ContaCoopSyncJob[],
  arquivos: ArquivoMensalCooperado[],
  cooperadosCadastro: Cooperado[]
): Promise<HbFichaBaseRepairPreviewRow[]> {
  const digits = normalizeCnpj(cnpj);
  const rows: HbFichaBaseRepairPreviewRow[] = [];
  for (const job of jobs) {
    const titularIds = titularCooperadoIds(cooperadosCadastro, job.cooperadoId);
    const remote = await listCooperadoContaCoopDescontosAbateValorReceber(
      supabase,
      digits,
      titularIds,
      job.mesReferencia
    );
    const descontosHb = dedupeDescontosContaCoopRemotos(remote);
    const arq = arquivos.find(
      (a) => a.cooperadoId === job.cooperadoId && a.mesReferencia === job.mesReferencia
    );
    const descontosArquivo = descontosContaCoopFromArquivo(arq);
    rows.push({
      cooperadoId: job.cooperadoId,
      mesReferencia: job.mesReferencia,
      cooperativaId: job.cooperativaId,
      linhasOperacional: descontosArquivo.length,
      liquidoOperacional: liquidoUsoContaCoopMes(descontosArquivo),
      linhasHbNuvem: descontosHb.length,
      liquidoHbNuvem: liquidoUsoContaCoopMes(descontosHb),
      precisaAtualizar: descontosFingerprint(descontosHb) !== arquivoDescontosFingerprint(arq),
    });
  }
  return rows;
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

export type HbAuthorizeProjecaoAReceberResult = {
  status: "synced" | "unchanged" | "pending";
  patched: number;
  checked: number;
  error?: string;
};

/**
 * Pós-authorize (servidor): projeta transações HB → contaCoopDescontos no operacional.json.
 * Idempotente — reprocessar duplicate RPC só re-sincroniza (dedupe hbTransactionId na nuvem).
 */
export async function projectContaCoopDescontosAfterHbAuthorize(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  opts?: { mesReferencia?: string }
): Promise<HbAuthorizeProjecaoAReceberResult> {
  const run = () =>
    repairOperacionalContaCoopDescontosForCooperado(supabase, cnpj, cooperadoId, {
      mesReferencia: opts?.mesReferencia,
    });

  try {
    const first = await run();
    const status = first.patched > 0 ? "synced" : "unchanged";
    return { status, patched: first.patched, checked: first.checked };
  } catch (e1) {
    const msg1 = e1 instanceof Error ? e1.message : "projecao_failed";
    try {
      await new Promise((r) => setTimeout(r, 350));
      const second = await run();
      const status = second.patched > 0 ? "synced" : "unchanged";
      return { status, patched: second.patched, checked: second.checked };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : msg1;
      return {
        status: "pending",
        patched: 0,
        checked: 0,
        error: msg2,
      };
    }
  }
}

export type HbFichaBaseRepairPreviewRow = {
  cooperadoId: string;
  mesReferencia: string;
  cooperativaId: string;
  linhasOperacional: number;
  liquidoOperacional: number;
  linhasHbNuvem: number;
  liquidoHbNuvem: number;
  precisaAtualizar: boolean;
};

/** Diagnóstico: operacional × hb_credit_transactions (sem gravar). */
export async function previewContaCoopDescontosRepairCooperativa(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoIdFilter?: string,
  jobsOverride?: ContaCoopSyncJob[]
): Promise<{ jobs: HbFichaBaseRepairPreviewRow[]; desalinhados: number }> {
  const digits = normalizeCnpj(cnpj);
  const op = await fetchOperacionalSync(supabase, digits);
  if (!op) return { jobs: [], desalinhados: 0 };

  const cooperadosCadastro = await fetchAllCooperadosFromStorage(supabase, digits);
  const jobs = jobsOverride?.length ? jobsOverride : collectContaCoopSyncJobs(op, cooperadoIdFilter);
  const rows = await previewJobs(supabase, digits, jobs, op.arquivosMensais ?? [], cooperadosCadastro);

  return {
    jobs: rows,
    desalinhados: rows.filter((r) => r.precisaAtualizar).length,
  };
}

/** Reconcilia operacional.json × HB para todos os cooperados com ficha pendente. */
export async function repairOperacionalContaCoopDescontosCooperativa(
  supabase: SupabaseClient,
  cnpj: string,
  opts?: { jobs?: ContaCoopSyncJob[] }
): Promise<{ patched: number; checked: number }> {
  const digits = normalizeCnpj(cnpj);
  const op = await fetchOperacionalSync(supabase, digits);
  if (!op) return { patched: 0, checked: 0 };

  const cooperadosCadastro = await fetchAllCooperadosFromStorage(supabase, digits);
  const jobs = opts?.jobs?.length ? opts.jobs : collectContaCoopSyncJobs(op);
  if (!jobs.length) return { patched: 0, checked: 0 };

  return patchOperacionalDescontos(supabase, digits, op, jobs, cooperadosCadastro);
}
