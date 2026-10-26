"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getData, isAppDataWarm, refreshData, subscribe, updateData } from "@/services/dataStore";
import { readAppDataPersistRaw } from "@/lib/staff/staffGestaoPersistKey";
import {
  medirRiquezaStaffGestao,
  staffGestaoRiquezaTotal,
  staffGestaoSnapshotPoorer,
} from "@/lib/staff/staffGestaoSnapshotGuard";
import {
  staffGestaoPerfilEhDesktop,
  staffGestaoPerfilReconciliarLivroForaDoLivroCaixa,
} from "@/lib/staff/staffGestaoPerfilDesktop";

/** Sem cadastro/ficha/PIX não grava — o mount do Início não pode persistir AppData vazio. */
export function devePersistirReconciliacaoLivroCaixaGestao(data: ReturnType<typeof getData>): boolean {
  return staffGestaoRiquezaTotal(medirRiquezaStaffGestao(data)) > 0;
}

function temPagamentoParaLivroCaixa(data: ReturnType<typeof getData>): boolean {
  return (data.pagamentosCooperado ?? []).some(
    (p) => p.status === "confirmado" || p.status === "aguardando_confirmacao"
  );
}

function dadosGestaoOuRelerStorage() {
  let data = getData();
  if (devePersistirReconciliacaoLivroCaixaGestao(data)) return data;
  if (typeof window === "undefined") return data;
  if (staffGestaoPerfilEhDesktop()) return data;
  try {
    const raw = readAppDataPersistRaw();
    if (raw && raw.length > 10_000) data = refreshData();
  } catch {
    /* storage */
  }
  return data;
}

function pathEhLivroCaixa(pathname: string): boolean {
  return pathname === "/livro-caixa" || pathname.startsWith("/livro-caixa/");
}

/**
 * PIX confirmado: ficha vira paga, sai de Em aberto e entra no Livro Caixa.
 * PC: só na rota Livro Caixa, sem subscribe (evita loop com reload do persist).
 */
export function useReconciliarLivroCaixaGestao(
  coopId: string | undefined,
  enabled: boolean
): void {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!enabled || !coopId) return;

    const desktop = staffGestaoPerfilEhDesktop();
    const foraDoLivro = !pathEhLivroCaixa(pathname);
    if (desktop && foraDoLivro && !staffGestaoPerfilReconciliarLivroForaDoLivroCaixa()) {
      return;
    }

    let cancelled = false;
    let timer = 0;

    const tentar = () => {
      if (cancelled || !isAppDataWarm()) return;
      void Promise.all([
        import("@/services/pagamentoIntegridadeService"),
        import("@/services/livroCaixaService"),
      ])
        .then(([integridade, caixa]) => {
          if (cancelled || !isAppDataWarm()) return;
          const data = dadosGestaoOuRelerStorage();
          if (!devePersistirReconciliacaoLivroCaixaGestao(data)) return;
          if (!temPagamentoParaLivroCaixa(data)) return;
          const aligned = integridade.posProcessarIntegridadePagamentosCooperativa(data);
          if (aligned !== data) {
            if (staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(aligned), medirRiquezaStaffGestao(data))) {
              return;
            }
            updateData(() => aligned);
            return;
          }
          const audit = caixa.auditarLivroCaixaContabilCooperativa(data, coopId);
          const falta =
            audit.pagamentosSemDebitoCaixa.length +
            audit.pagamentosSemTaxaCoopCaixa.length +
            audit.pagamentosSemMensalidadeFichaCaixa.length +
            audit.pagamentosSemOutrosDescontosCaixa.length +
            audit.mensalidadesPagasSemCreditoCaixa.length;
          if (falta === 0) return;
          const next = caixa.reconciliarLivroCaixaContabilCooperativa(data, coopId);
          if (next !== data) {
            if (staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(next), medirRiquezaStaffGestao(data))) {
              return;
            }
            updateData(() => next);
          }
        })
        .catch(() => {
          /* Início permanece visível se o caixa falhar */
        });
    };

    const agendar = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tentar, desktop ? 2_500 : 800);
    };

    if (desktop) {
      const delay = pathEhLivroCaixa(pathname) ? 2_000 : 0;
      if (delay <= 0) return;
      timer = window.setTimeout(tentar, delay);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    tentar();
    agendar();
    const unsub = subscribe(agendar);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [enabled, coopId, pathname]);
}
