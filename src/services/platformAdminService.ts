import type { AppData, AuditEntry, Cooperativa, User } from "@/types";
import { normalizeCnpj, formatCnpj } from "@/utils/cooperativa";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";

const STORAGE_KEY = "coopeagriplla_data";
const SESSION_KEY = "coopeagriplla_session";
/** Limite típico por origem no navegador (conservador). */
const BROWSER_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export interface CloudCooperativaOverview {
  id: string;
  nome: string;
  cnpj: string;
  email: string;
  responsavel: string;
  telefone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudPlatformOverview {
  configured: boolean;
  cooperativasTableOk: boolean;
  appUsersTableOk: boolean;
  cooperativas: CloudCooperativaOverview[];
  error?: string;
}

export interface CooperativaMemberEmail {
  nome: string;
  email: string;
  tipo: "responsavel" | "equipe" | "cooperado";
  funcao?: string;
  ativo: boolean;
}

export interface CooperativaPlatformRow {
  id: string;
  nome: string;
  cnpj: string;
  cnpjFormatado: string;
  status: Cooperativa["status"];
  responsavel?: string;
  emailCooperativa?: string;
  telefone?: string;
  cadastradaEm: string;
  diasDeUso: number;
  tempoUsoLabel: string;
  ultimaAtividade?: string;
  diasDesdeUltimaAtividade?: number;
  totalCooperados: number;
  cooperadosAtivos: number;
  usuariosComLogin: number;
  totalEntregas: number;
  entregasNoMes: number;
  emails: CooperativaMemberEmail[];
  origem: "local" | "nuvem" | "local+nuvem";
}

export interface StorageLimitsSnapshot {
  totalBytes: number;
  dataBytes: number;
  sessionBytes: number;
  outrosBytes: number;
  limiteEstimadoBytes: number;
  percentualUsado: number;
  status: "ok" | "atencao" | "critico";
  statusLabel: string;
  maioresChaves: { chave: string; bytes: number; label: string }[];
  totaisRegistros: {
    cooperativas: number;
    cooperados: number;
    usuarios: number;
    entregas: number;
    mensalidades: number;
    audit: number;
  };
}

export interface PlatformAdminSnapshot {
  geradoEm: string;
  totais: {
    cooperativas: number;
    cooperativasAtivas: number;
    cooperados: number;
    cooperadosAtivos: number;
    usuarios: number;
    usuariosAtivos: number;
    entregas: number;
    mediaDiasUso: number;
  };
  cooperativas: CooperativaPlatformRow[];
  storage: StorageLimitsSnapshot;
  nuvem: {
    configured: boolean;
    cooperativasTableOk: boolean;
    appUsersTableOk: boolean;
    cooperativasNaNuvem: number;
    cooperativasSoNaNuvem: number;
  };
  atividadeRecente: AuditEntry[];
}

function diasEntre(inicio: string, fim = new Date()): number {
  const start = new Date(inicio).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((fim.getTime() - start) / (1000 * 60 * 60 * 24)));
}

export function formatTempoUso(dias: number): string {
  if (dias <= 0) return "Menos de 1 dia";
  if (dias === 1) return "1 dia";
  if (dias < 30) return `${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"} (${dias} dias)`;
  const anos = Math.floor(dias / 365);
  const restoMeses = Math.floor((dias % 365) / 30);
  if (restoMeses === 0) return `${anos} ${anos === 1 ? "ano" : "anos"} (${dias} dias)`;
  return `${anos}a ${restoMeses}m (${dias} dias)`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function byteSize(key: string, value: string): number {
  return new Blob([key, value]).size;
}

function labelStorageKey(key: string): string {
  if (key === STORAGE_KEY) return "Dados do app";
  if (key === SESSION_KEY) return "Sessão de login";
  if (key.includes("cloud")) return "Credenciais nuvem";
  if (key.includes("pending")) return "Fila offline";
  return key;
}

export function measureBrowserStorageLimits(data: AppData): StorageLimitsSnapshot {
  const totaisRegistros = {
    cooperativas: data.cooperativas.length,
    cooperados: data.cooperados.length,
    usuarios: data.users.length,
    entregas: data.notasPedido.length,
    mensalidades: data.mensalidades.length,
    audit: data.auditLog.length,
  };

  if (typeof window === "undefined") {
    return {
      totalBytes: 0,
      dataBytes: 0,
      sessionBytes: 0,
      outrosBytes: 0,
      limiteEstimadoBytes: BROWSER_STORAGE_LIMIT_BYTES,
      percentualUsado: 0,
      status: "ok",
      statusLabel: "Indisponível no servidor",
      maioresChaves: [],
      totaisRegistros,
    };
  }

  let totalBytes = 0;
  let dataBytes = 0;
  let sessionBytes = 0;
  const maioresChaves: { chave: string; bytes: number; label: string }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (!chave) continue;
    const valor = localStorage.getItem(chave) ?? "";
    const bytes = byteSize(chave, valor);
    totalBytes += bytes;
    if (chave === STORAGE_KEY) dataBytes = bytes;
    else if (chave === SESSION_KEY) sessionBytes = bytes;
    maioresChaves.push({ chave, bytes, label: labelStorageKey(chave) });
  }

  maioresChaves.sort((a, b) => b.bytes - a.bytes);
  const outrosBytes = Math.max(0, totalBytes - dataBytes - sessionBytes);
  const percentualUsado = Math.min(100, Math.round((totalBytes / BROWSER_STORAGE_LIMIT_BYTES) * 100));

  let status: StorageLimitsSnapshot["status"] = "ok";
  let statusLabel = "Armazenamento local confortável";
  if (percentualUsado >= 90) {
    status = "critico";
    statusLabel = "Quase no limite — libere fotos antigas ou envie entregas à nuvem";
  } else if (percentualUsado >= 70) {
    status = "atencao";
    statusLabel = "Uso elevado — monitore fotos e dados offline";
  }

  return {
    totalBytes,
    dataBytes,
    sessionBytes,
    outrosBytes,
    limiteEstimadoBytes: BROWSER_STORAGE_LIMIT_BYTES,
    percentualUsado,
    status,
    statusLabel,
    maioresChaves: maioresChaves.slice(0, 6),
    totaisRegistros,
  };
}

function userPertenceCooperativa(user: User, coop: Cooperativa): boolean {
  if (user.cooperativaId === coop.id) return true;
  const cnpj = normalizeCnpj(coop.cnpj);
  if (user.cooperativaCnpj && normalizeCnpj(user.cooperativaCnpj) === cnpj) return true;
  if (user.cooperadoId) {
    const cooperado = coop.id;
    return user.cooperativaId === cooperado;
  }
  return false;
}

function emailsDaCooperativa(data: AppData, coop: Cooperativa): CooperativaMemberEmail[] {
  const cnpj = normalizeCnpj(coop.cnpj);
  const emails: CooperativaMemberEmail[] = [];
  const seen = new Set<string>();

  const push = (entry: CooperativaMemberEmail) => {
    const key = `${entry.email.toLowerCase()}|${entry.tipo}`;
    if (seen.has(key)) return;
    seen.add(key);
    emails.push(entry);
  };

  if (coop.email?.trim()) {
    push({
      nome: coop.responsavel?.trim() || "Responsável principal",
      email: coop.email.trim().toLowerCase(),
      tipo: "responsavel",
      funcao: "Cadastro da cooperativa",
      ativo: coop.status === "ativa",
    });
  }

  for (const user of data.users) {
    const pertence =
      user.cooperativaId === coop.id ||
      (user.cooperativaCnpj && normalizeCnpj(user.cooperativaCnpj) === cnpj);
    if (!pertence) continue;

    const tipo: CooperativaMemberEmail["tipo"] =
      user.role === "cooperado" ? "cooperado" : "equipe";

    push({
      nome: user.name,
      email: user.email,
      tipo,
      funcao: user.funcao ?? user.role,
      ativo: user.active,
    });
  }

  for (const cooperado of data.cooperados.filter((c) => c.cooperativaId === coop.id)) {
    const user = data.users.find((u) => u.cooperadoId === cooperado.id);
    if (user) continue;
    push({
      nome: cooperado.nomeCompleto,
      email: "(sem login no app)",
      tipo: "cooperado",
      funcao: cooperado.status,
      ativo: cooperado.status === "ativo",
    });
  }

  return emails.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
}

function ultimaAtividadeCooperativa(data: AppData, coopId: string, cnpj: string): string | undefined {
  const stamps: number[] = [];
  const coop = data.cooperativas.find((c) => c.id === coopId);
  if (coop?.updatedAt) stamps.push(new Date(coop.updatedAt).getTime());

  for (const c of data.cooperados.filter((x) => x.cooperativaId === coopId)) {
    stamps.push(new Date(c.updatedAt).getTime());
  }
  for (const n of data.notasPedido.filter((x) => notaPertenceCooperativa(data, x, coopId))) {
    stamps.push(new Date(n.updatedAt).getTime());
  }
  for (const a of data.auditLog) {
    if (a.entityId === coopId) stamps.push(new Date(a.timestamp).getTime());
  }

  const max = Math.max(...stamps.filter((t) => !Number.isNaN(t)), 0);
  if (!max) return undefined;
  return new Date(max).toISOString();
}

function buildRowFromLocal(data: AppData, coop: Cooperativa): CooperativaPlatformRow {
  const cooperados = data.cooperados.filter((c) => c.cooperativaId === coop.id);
  const cooperadosAtivos = cooperados.filter((c) => c.status === "ativo").length;
  const entregas = data.notasPedido.filter((n) => notaPertenceCooperativa(data, n, coop.id));
  const mesAtual = new Date().toISOString().slice(0, 7);
  const usuarios = data.users.filter(
    (u) =>
      u.cooperativaId === coop.id ||
      (u.cooperativaCnpj && normalizeCnpj(u.cooperativaCnpj) === normalizeCnpj(coop.cnpj))
  );
  const cadastradaEm = coop.createdAt;
  const diasDeUso = diasEntre(cadastradaEm);
  const ultimaAtividade = ultimaAtividadeCooperativa(data, coop.id, coop.cnpj);

  return {
    id: coop.id,
    nome: coop.nome,
    cnpj: normalizeCnpj(coop.cnpj),
    cnpjFormatado: formatCnpj(coop.cnpj),
    status: coop.status,
    responsavel: coop.responsavel,
    emailCooperativa: coop.email,
    telefone: coop.telefone,
    cadastradaEm,
    diasDeUso,
    tempoUsoLabel: formatTempoUso(diasDeUso),
    ultimaAtividade,
    diasDesdeUltimaAtividade: ultimaAtividade ? diasEntre(ultimaAtividade) : undefined,
    totalCooperados: cooperados.length,
    cooperadosAtivos,
    usuariosComLogin: usuarios.filter((u) => u.active).length,
    totalEntregas: entregas.length,
    entregasNoMes: entregas.filter((n) => n.mesReferencia === mesAtual).length,
    emails: emailsDaCooperativa(data, coop),
    origem: "local",
  };
}

function buildRowFromCloud(cloud: CloudCooperativaOverview): CooperativaPlatformRow {
  const diasDeUso = diasEntre(cloud.createdAt);
  return {
    id: cloud.id,
    nome: cloud.nome,
    cnpj: normalizeCnpj(cloud.cnpj),
    cnpjFormatado: formatCnpj(cloud.cnpj),
    status: cloud.status === "inativa" ? "inativa" : "ativa",
    responsavel: cloud.responsavel,
    emailCooperativa: cloud.email,
    telefone: cloud.telefone,
    cadastradaEm: cloud.createdAt,
    diasDeUso,
    tempoUsoLabel: formatTempoUso(diasDeUso),
    ultimaAtividade: cloud.updatedAt,
    diasDesdeUltimaAtividade: cloud.updatedAt ? diasEntre(cloud.updatedAt) : undefined,
    totalCooperados: 0,
    cooperadosAtivos: 0,
    usuariosComLogin: 0,
    totalEntregas: 0,
    entregasNoMes: 0,
    emails: cloud.email
      ? [
          {
            nome: cloud.responsavel || "Responsável",
            email: cloud.email.toLowerCase(),
            tipo: "responsavel",
            funcao: "Cadastro na nuvem",
            ativo: cloud.status === "ativa",
          },
        ]
      : [],
    origem: "nuvem",
  };
}

export function buildPlatformAdminSnapshot(
  data: AppData,
  cloud?: CloudPlatformOverview | null
): PlatformAdminSnapshot {
  const byCnpj = new Map<string, CooperativaPlatformRow>();

  for (const coop of data.cooperativas) {
    const row = buildRowFromLocal(data, coop);
    byCnpj.set(row.cnpj, row);
  }

  let cooperativasSoNaNuvem = 0;
  if (cloud?.cooperativas?.length) {
    for (const cloudCoop of cloud.cooperativas) {
      const cnpj = normalizeCnpj(cloudCoop.cnpj);
      const local = byCnpj.get(cnpj);
      if (local) {
        const cadastradaEm = local.cadastradaEm || cloudCoop.createdAt;
        const diasDeUso = diasEntre(cadastradaEm);
        byCnpj.set(cnpj, {
          ...local,
          origem: "local+nuvem",
          cadastradaEm,
          diasDeUso,
          tempoUsoLabel: formatTempoUso(diasDeUso),
          emailCooperativa: local.emailCooperativa || cloudCoop.email,
          responsavel: local.responsavel || cloudCoop.responsavel,
        });
      } else {
        cooperativasSoNaNuvem++;
        byCnpj.set(cnpj, buildRowFromCloud(cloudCoop));
      }
    }
  }

  const cooperativas = [...byCnpj.values()].sort(
    (a, b) => new Date(b.cadastradaEm).getTime() - new Date(a.cadastradaEm).getTime()
  );

  const mediaDiasUso =
    cooperativas.length > 0
      ? Math.round(cooperativas.reduce((s, c) => s + c.diasDeUso, 0) / cooperativas.length)
      : 0;

  return {
    geradoEm: new Date().toISOString(),
    totais: {
      cooperativas: cooperativas.length,
      cooperativasAtivas: cooperativas.filter((c) => c.status === "ativa").length,
      cooperados: data.cooperados.length,
      cooperadosAtivos: data.cooperados.filter((c) => c.status === "ativo").length,
      usuarios: data.users.length,
      usuariosAtivos: data.users.filter((u) => u.active).length,
      entregas: data.notasPedido.length,
      mediaDiasUso,
    },
    cooperativas,
    storage: measureBrowserStorageLimits(data),
    nuvem: {
      configured: cloud?.configured ?? false,
      cooperativasTableOk: cloud?.cooperativasTableOk ?? false,
      appUsersTableOk: cloud?.appUsersTableOk ?? false,
      cooperativasNaNuvem: cloud?.cooperativas?.length ?? 0,
      cooperativasSoNaNuvem,
    },
    atividadeRecente: data.auditLog.slice(0, 15),
  };
}
