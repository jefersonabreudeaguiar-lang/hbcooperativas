import type { AppData } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional } from "@/services/livroCaixaPagamentoGuard";
import { mergeLivroCaixaControleAnualFromCloud } from "@/services/livroCaixaService";
import { mergeLivroCaixaOrigensCadastroFromCloud } from "@/lib/livro-caixa/livroCaixaOrigemPastas";
import { isLancamentoManualEditavel } from "@/lib/livro-caixa/lancamentoManual";

/** Mantém os outros domínios exatamente como foram consultados na nuvem. */
export function prepararLivroCaixaSync(cloud: OperacionalSyncPayload, local: AppData, coopId: string): OperacionalSyncPayload {
  const controle = mergeLivroCaixaControleAnualFromCloud(
    local.livroCaixaControleAnual?.find((c) => c.cooperativaId === coopId),
    cloud.livroCaixaControleAnual?.find((c) => c.cooperativaId === coopId),
  );
  const payload: OperacionalSyncPayload = {
    ...cloud,
    updatedAt: new Date().toISOString(),
    fullReset: false,
    wipeNotas: false,
    livroCaixa: [...new Map([
      ...(cloud.livroCaixa ?? []),
      ...(local.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId && isLancamentoManualEditavel(l)),
    ].map((l) => [l.id, l])).values()],
    livroCaixaExcluidos: [
      ...(cloud.livroCaixaExcluidos ?? []),
      ...(local.livroCaixaExcluidos ?? []).filter((l) => l.cooperativaId === coopId),
    ],
    livroCaixaControleAnual: controle ? [controle] : cloud.livroCaixaControleAnual,
    livroCaixaOrigensCadastro: mergeLivroCaixaOrigensCadastroFromCloud(
      (local.livroCaixaOrigensCadastro ?? []).filter((o) => o.cooperativaId === coopId),
      cloud.livroCaixaOrigensCadastro ?? [],
    ),
  };
  return aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional(cloud, payload).payload;
}
