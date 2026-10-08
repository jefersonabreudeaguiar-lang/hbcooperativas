/**
 * Diagnóstico read-only — comparar valor a receber / resumo (motor paridade vs card vs cache).
 * Homolog cooperado Orlando (mesmo critério do painel RQL).
 */
import type { User } from "@/types";
import { leituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import {
  filtrarInicioCardPersistidoLeituraBic,
  resolverInicioCardMotorFromAppData,
} from "@/lib/cooperadoInicioCardPolicy";
import { lerInicioCardPersistidoFlex } from "@/lib/cooperadoInicioCardPersistencia";
import { canUseRqlPerfHomologPanel } from "@/lib/performance/rqlPerfHomologAccess";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

export type CooperadoFinanceiroParidadeProbe = {
  generatedAt: string;
  standalone: boolean;
  release: { build?: number; gitCommitSha?: string; deploymentId?: string } | null;
  cooperadoId: string;
  cooperativaId: string;
  paridade: {
    valorLiquido: number;
    mesLabel: string;
    mesesResumo: string[];
    valorEntregas: number;
    valorLiquidoResumo: number;
  };
  motorCard: { mesLabel: string; valor: number };
  persistido: { mesLabel: string; valor: number; savedAt: string } | null;
};

export function buildCooperadoFinanceiroParidadeProbe(
  user: Omit<User, "password"> | null | undefined
): CooperadoFinanceiroParidadeProbe | null {
  if (!user || user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return null;
  const data = getData();
  const cooperativaId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!cooperativaId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, cooperativaId);
  const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  const motorCard = resolverInicioCardMotorFromAppData(data, cooperadoId, cooperativaId);
  const rawPersistido = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
  );

  const w = typeof window !== "undefined" ? (window as Window & { __HB_PAGE_RELEASE__?: unknown }) : null;
  const release = (w?.__HB_PAGE_RELEASE__ ?? null) as CooperadoFinanceiroParidadeProbe["release"];

  return {
    generatedAt: new Date().toISOString(),
    standalone: isAppStandalone(),
    release,
    cooperadoId,
    cooperativaId,
    paridade: {
      valorLiquido: paridade.valorLiquido,
      mesLabel: paridade.mesLabel,
      mesesResumo: paridade.mesesResumo,
      valorEntregas: paridade.resumo.valorEntregas,
      valorLiquidoResumo: paridade.resumo.valorLiquido,
    },
    motorCard: { mesLabel: motorCard.mesLabel, valor: motorCard.valor },
    persistido: rawPersistido
      ? {
          mesLabel: rawPersistido.display.mesLabel,
          valor: rawPersistido.display.valor,
          savedAt: rawPersistido.savedAt,
        }
      : null,
  };
}

export type CooperadoParidadeProbeHandle = {
  report: () => CooperadoFinanceiroParidadeProbe | null;
  print: () => CooperadoFinanceiroParidadeProbe | null;
  copyJson: () => string;
};

export function installCooperadoFinanceiroParidadeProbe(
  user: Omit<User, "password"> | null | undefined
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as Window & { __hbCoopParidade?: CooperadoParidadeProbeHandle };
  if (!canUseRqlPerfHomologPanel(user)) {
    delete w.__hbCoopParidade;
    return () => undefined;
  }

  const handle: CooperadoParidadeProbeHandle = {
    report: () => buildCooperadoFinanceiroParidadeProbe(user),
    print: () => {
      const r = buildCooperadoFinanceiroParidadeProbe(user);
      if (r) {
        console.info("[HB Paridade] valor a receber / resumo (motor universal)");
        console.table({
          paridade_valor: r.paridade.valorLiquido,
          card_motor: r.motorCard.valor,
          cache_local: r.persistido?.valor ?? "—",
          mes: r.paridade.mesLabel,
        });
        console.log(r);
      } else {
        console.info("[HB Paridade] AppData ainda não warm ou usuário inválido.");
      }
      return r;
    },
    copyJson: () => {
      const r = buildCooperadoFinanceiroParidadeProbe(user);
      const text = JSON.stringify(r, null, 2);
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      return text;
    },
  };

  w.__hbCoopParidade = handle;
  return () => {
    delete w.__hbCoopParidade;
  };
}
