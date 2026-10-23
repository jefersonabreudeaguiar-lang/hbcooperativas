/**
 * Resposta ao hint de lançamento do responsável: notas leves + operacional leve + snapshots.
 */
import type { User } from "@/types";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoMessengerOperacionalLightPull } from "@/lib/cooperado/cooperadoMessengerOperacionalLightPull";
import { runCooperadoNotasContratosLightPull } from "@/lib/cooperado/cooperadoNotasContratosLightPull";
import { cooperadoMobileSyncTrace } from "@/lib/cooperado/cooperadoMobileSyncTrace";
import { normalizeCnpj } from "@/utils/cooperativa";

export async function runCooperadoLancamentoHintPull(opts: {
  cnpj: string;
  cooperativaId: string;
  user: Omit<User, "password">;
  remote: CooperativaCloudRevision;
  notaId?: string;
}): Promise<boolean> {
  const digits = normalizeCnpj(opts.cnpj);
  if (digits.length !== 14) return false;

  cooperadoMobileSyncTrace("hint_pull_start", opts.notaId ?? "");

  const notasOk = await runCooperadoNotasContratosLightPull({
    cnpj: digits,
    user: opts.user,
    remote: opts.remote,
  });
  const opOk = await runCooperadoMessengerOperacionalLightPull({
    cnpj: digits,
    cooperativaId: opts.cooperativaId,
    user: opts.user,
    remote: opts.remote,
  });

  cooperadoMobileSyncTrace("hint_pull_done", `notas=${notasOk} op=${opOk}`);
  return notasOk || opOk;
}
