import type { AppData } from "@/types";
import { getInstituicoesCatalogo } from "@/services/catalogoContratosService";
import { isStaffGestaoRole } from "@/lib/performance/cooperadoColdStart";
import { normalizeCnpj } from "@/utils/cooperativa";
import { exigeSenhaCadastroCooperado } from "@/utils/cooperativaCadastro";
import { medirRiquezaStaffGestao, staffGestaoRiquezaTotal } from "@/lib/staff/staffGestaoSnapshotGuard";

const SEEN_PREFIX = "hb-staff-primeiro-dia-contratos:";

export const STAFF_PRIMEIRO_DIA_INICIO_TITULO = "Primeiro dia da cooperativa";
export const STAFF_PRIMEIRO_DIA_INICIO_TEXTO =
  "Este painel é só desta cooperativa. Comece pelo contrato e pelo primeiro cooperado. A mensalidade só começa no primeiro cadastro.";
export const STAFF_PRIMEIRO_DIA_CONTRATOS_TITULO = "Primeiro dia: cadastre o primeiro contrato";
export const STAFF_PRIMEIRO_DIA_CONTRATOS_TEXTO =
  "Sem instituição, o cooperado ainda não consegue entregar. Cadastre a escola ou o comprador e depois os produtos com preço.";
export const STAFF_PRIMEIRO_DIA_CONTRATOS_HREF = "/contratos";
export const STAFF_PRIMEIRO_DIA_SENHA_TITULO = "Defina a senha de cadastro dos cooperados";
export const STAFF_PRIMEIRO_DIA_SENHA_TEXTO =
  "Passe essa senha junto com o CNPJ. Sem ela, o cooperado não sabe o que informar no cadastro.";
export const STAFF_PRIMEIRO_DIA_SENHA_HREF = "/meu-perfil#senha-cadastro";
export const STAFF_PRIMEIRO_DIA_CONVITE_TITULO = "Chame o primeiro cooperado";
export const STAFF_PRIMEIRO_DIA_CONVITE_TEXTO =
  "Passe o CNPJ e a senha de cadastro. Ele entra em Cadastro, cria a conta e já pode entregar.";
export const STAFF_PRIMEIRO_DIA_CONVITE_HREF = "/cadastro";
export const STAFF_PRIMEIRO_DIA_COBRANCA_TITULO = "Como funciona a mensalidade do app";
export const STAFF_PRIMEIRO_DIA_COBRANCA_TEXTO =
  "O mês começa quando o primeiro cooperado se cadastra. Depois cobra-se por cooperado, com um mínimo por cooperativa. Atraso pode suspender o painel.";

export function isStaffPrimeiroDiaContratosVazio(opts: {
  role?: string;
  coopId?: string | null;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (!opts.warm || !opts.data || !opts.coopId) return false;
  if (!isStaffGestaoRole(opts.role)) return false;
  return getInstituicoesCatalogo(opts.data, opts.coopId).length === 0;
}

export function shouldShowStaffPrimeiroDiaSenhaCadastro(opts: {
  role?: string;
  coopId?: string | null;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (!opts.warm || !opts.data || !opts.coopId) return false;
  if (!isStaffGestaoRole(opts.role)) return false;
  const coop = opts.data.cooperativas.find((c) => c.id === opts.coopId);
  if (!coop) return false;
  return !exigeSenhaCadastroCooperado(coop, coop.mensalidadeConfig);
}

export function shouldShowStaffPrimeiroDiaConviteCooperado(opts: {
  role?: string;
  coopId?: string | null;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (!opts.warm || !opts.data || !opts.coopId) return false;
  if (!isStaffGestaoRole(opts.role)) return false;
  const coop = opts.data.cooperativas.find((c) => c.id === opts.coopId);
  if (!coop) return false;
  return (opts.data.cooperados ?? []).filter((c) => c.cooperativaId === opts.coopId).length === 0;
}

export function shouldShowStaffPrimeiroDiaCobranca(opts: {
  role?: string;
  coopId?: string | null;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (!opts.warm || !opts.data || !opts.coopId) return false;
  if (!isStaffGestaoRole(opts.role)) return false;
  const coop = opts.data.cooperativas.find((c) => c.id === opts.coopId);
  if (!coop) return false;
  const cob = coop.cobrancaSaas;
  if (cob?.cicloInicioEm) return false;
  if (cob?.statusMes && cob.statusMes !== "aguardando_primeiro_cooperado") return false;
  return (opts.data.cooperados ?? []).filter((c) => c.cooperativaId === opts.coopId).length === 0;
}

/** Avisos no Início só se a cooperativa ativa ainda não tem operação. Casa com lastro não entra. */
export function isStaffPrimeiroDiaInicio(opts: {
  role?: string;
  coopId?: string | null;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (!isStaffPrimeiroDiaContratosVazio(opts)) return false;
  if (!opts.data || !opts.coopId) return false;
  return staffGestaoRiquezaTotal(medirRiquezaStaffGestao(opts.data, opts.coopId)) === 0;
}

export function shouldRedirectStaffPrimeiroDiaContratos(opts: {
  role?: string;
  coopId?: string | null;
  pathname: string;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (opts.pathname.startsWith("/contratos")) return false;
  return isStaffPrimeiroDiaContratosVazio(opts);
}

export function staffPrimeiroDiaContratosSeenKey(cnpj: string): string {
  return `${SEEN_PREFIX}${normalizeCnpj(cnpj)}`;
}

export function hasStaffPrimeiroDiaContratosBeenSeen(cnpj: string): boolean {
  if (typeof window === "undefined") return true;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return true;
  try {
    return sessionStorage.getItem(staffPrimeiroDiaContratosSeenKey(digits)) === "1";
  } catch {
    return true;
  }
}

export function markStaffPrimeiroDiaContratosSeen(cnpj: string): void {
  if (typeof window === "undefined") return;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  try {
    sessionStorage.setItem(staffPrimeiroDiaContratosSeenKey(digits), "1");
  } catch {
    /* private */
  }
}
