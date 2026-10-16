/**
 * Cooperado no browser (tela larga, não PWA): valores já vêm do AppData/BIC ao vivo.
 * Evita rajadas de rematerialização PWA + sync BIC mobile que travam a UI no desktop.
 */
import type { User } from "@/types";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { cooperadoGaValorReceberExibicaoResolvida } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoPilotAppDataTemFinanceiroLocal } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoFinanceiroExibicaoCachePronto } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";

export function isCooperadoBrowserDesktopWide(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return false;
    return !window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

/** BIC ativo + browser desktop — perfil “leitura direta”, snapshots só sob demanda. */
export function cooperadoBrowserDesktopBicPerfActive(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  return isCooperadoBrowserDesktopWide() && isCooperadoMobileBicLeituraAuthority(user);
}

/** Exibição já coerente — não precisa rematerializar nem sync de sessão no desktop. */
export function cooperadoBrowserDesktopFinanceiroEstavel(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!cooperadoBrowserDesktopBicPerfActive(user)) return false;
  return (
    cooperadoGaValorReceberExibicaoResolvida(user) &&
    cooperadoPilotAppDataTemFinanceiroLocal(user) &&
    cooperadoFinanceiroExibicaoCachePronto(user)
  );
}
