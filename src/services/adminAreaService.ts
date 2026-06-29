import type { AppData, AuditEntry, Cooperativa, User } from "@/types";
import { getData, addAuditEntry, updateData, refreshSessionForUser } from "@/services/dataStore";
import { getAdminStats, getRelatorioResumoFinanceiro } from "@/services/dashboardService";
import { getRelatorioPagarCooperado } from "@/services/relatorioService";
import { pushCooperativaProfileToCloud } from "@/services/cooperativaSyncCloudService";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { getCurrentMesReferencia, formatCurrency } from "@/utils/format";
import { getCooperadoNome, sumBy } from "@/utils/calculations";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { exigeSenhaAreaAdmin } from "@/utils/cooperativaCadastro";
import { updateCloudBootstrapPassword, secureApiFetch } from "@/lib/security/clientSession";

const SESSION_PREFIX = "coopeagriplla_admin_session_";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

interface AdminSession {
  coopId: string;
  unlockedAt: number;
  expiresAt: number;
}

export interface AdminAreaAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  href?: string;
  count?: number;
}

export interface AdminAreaSnapshot {
  mesReferencia: string;
  stats: ReturnType<typeof getAdminStats>;
  resumoFinanceiro: ReturnType<typeof getRelatorioResumoFinanceiro>;
  alertas: AdminAreaAlert[];
  entregasAguardando: { id: string; cooperadoNome: string; instituicao: string; dataEntrega: string }[];
  pagamentosPendentes: { cooperadoId: string; cooperadoNome: string; valor: number; mes: string }[];
  mensalidadesAtrasadas: number;
  cotasAtrasadas: number;
  instituicoesAtivas: number;
  auditRecente: AuditEntry[];
}

function cooperadoIdsDaCoop(data: AppData, cooperativaId?: string): Set<string> {
  if (!cooperativaId) return new Set(data.cooperados.map((c) => c.id));
  return new Set(data.cooperados.filter((c) => c.cooperativaId === cooperativaId).map((c) => c.id));
}

export { exigeSenhaAreaAdmin };

export function getSenhaAreaAdminHash(cooperativa: Cooperativa | undefined): string | undefined {
  return cooperativa?.senhaAreaAdminHash?.trim() || undefined;
}

export async function verifySenhaAreaAdmin(plain: string, storedHash: string | undefined): Promise<boolean> {
  if (!storedHash?.trim()) return false;
  return verifyPassword(plain, storedHash);
}

export function isAdminAreaUnlocked(coopId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const raw = sessionStorage.getItem(SESSION_PREFIX + coopId);
  if (!raw) return false;
  try {
    const session = JSON.parse(raw) as AdminSession;
    if (Date.now() > session.expiresAt || session.coopId !== coopId) {
      sessionStorage.removeItem(SESSION_PREFIX + coopId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function unlockAdminArea(coopId: string): void {
  const now = Date.now();
  const session: AdminSession = { coopId, unlockedAt: now, expiresAt: now + SESSION_TTL_MS };
  sessionStorage.setItem(SESSION_PREFIX + coopId, JSON.stringify(session));
}

export function lockAdminArea(coopId: string): void {
  sessionStorage.removeItem(SESSION_PREFIX + coopId);
}

export function refreshAdminAreaSession(coopId: string): void {
  if (isAdminAreaUnlocked(coopId)) unlockAdminArea(coopId);
}

export async function salvarSenhaAreaAdmin(
  updateData: (fn: (d: AppData) => AppData) => void,
  cooperativaId: string,
  novaSenha: string | undefined,
  user: Pick<User, "id" | "name">,
  senhaAtual?: string
): Promise<{ success: boolean; error?: string }> {
  const plain = novaSenha?.trim();
  const data = getData();
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return { success: false, error: "Cooperativa não encontrada." };

  const hashAtual = getSenhaAreaAdminHash(coop);
  if (hashAtual) {
    if (!senhaAtual?.trim()) {
      return { success: false, error: "Informe a senha atual para alterar." };
    }
    const ok = await verifySenhaAreaAdmin(senhaAtual, hashAtual);
    if (!ok) return { success: false, error: "Senha atual incorreta." };
  }

  if (!plain) {
    return { success: false, error: "Informe a nova senha." };
  }
  if (plain.length < 6) {
    return { success: false, error: "A senha deve ter no mínimo 6 caracteres." };
  }

  const hash = await hashPassword(plain);
  const now = new Date().toISOString();

  updateData((d) => {
    const updated = addAuditEntry(
      {
        ...d,
        cooperativas: d.cooperativas.map((c) =>
          c.id === cooperativaId
            ? { ...c, senhaAreaAdminHash: hash, updatedAt: now }
            : c
        ),
      },
      {
        entityType: "cooperativa",
        entityId: cooperativaId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: hashAtual ? "Senha da área administrativa alterada" : "Senha da área administrativa cadastrada",
      }
    );
    return updated;
  });

  const atualizada = getData().cooperativas.find((c) => c.id === cooperativaId);
  if (atualizada) void pushCooperativaProfileToCloud(atualizada);

  return { success: true };
}

export async function removerSenhaAreaAdmin(
  updateData: (fn: (d: AppData) => AppData) => void,
  cooperativaId: string,
  user: Pick<User, "id" | "name">,
  senhaAtual: string
): Promise<{ success: boolean; error?: string }> {
  const data = getData();
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const hashAtual = getSenhaAreaAdminHash(coop);
  if (!hashAtual) return { success: false, error: "Nenhuma senha cadastrada." };

  const ok = await verifySenhaAreaAdmin(senhaAtual, hashAtual);
  if (!ok) return { success: false, error: "Senha incorreta." };

  const now = new Date().toISOString();
  updateData((d) =>
    addAuditEntry(
      {
        ...d,
        cooperativas: d.cooperativas.map((c) =>
          c.id === cooperativaId
            ? { ...c, senhaAreaAdminHash: undefined, updatedAt: now }
            : c
        ),
      },
      {
        entityType: "cooperativa",
        entityId: cooperativaId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Senha da área administrativa removida",
      }
    )
  );

  lockAdminArea(cooperativaId);
  const atualizada = getData().cooperativas.find((c) => c.id === cooperativaId);
  if (atualizada) void pushCooperativaProfileToCloud(atualizada);

  return { success: true };
}

/** Altera a senha de login usada para entrar em /admin (local + nuvem). */
export async function alterarSenhaLoginAdmin(
  userId: string,
  senhaAtual: string,
  novaSenha: string,
  auditUser: Pick<User, "id" | "name">
): Promise<{ success: boolean; error?: string }> {
  const atual = senhaAtual.trim();
  const nova = novaSenha.trim();

  if (!atual) return { success: false, error: "Informe a senha atual." };
  if (nova.length < 6) return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres." };
  if (nova === atual) return { success: false, error: "A nova senha deve ser diferente da atual." };

  const data = getData();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return { success: false, error: "Usuário não encontrado neste dispositivo." };

  const ok = await verifyPassword(atual, user.password);
  if (!ok) return { success: false, error: "Senha atual incorreta." };

  const hash = await hashPassword(nova);
  updateData((d) =>
    addAuditEntry(
      {
        ...d,
        users: d.users.map((u) => (u.id === userId ? { ...u, password: hash } : u)),
      },
      {
        entityType: "user",
        entityId: userId,
        action: "editar",
        userId: auditUser.id,
        userName: auditUser.name,
        changes: "Senha de acesso ao painel /admin alterada",
      }
    )
  );

  refreshSessionForUser(userId);
  updateCloudBootstrapPassword(nova);

  try {
    const res = await secureApiFetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: atual, newPassword: nova }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status !== 503) {
        return {
          success: false,
          error: json.error ?? "Senha salva localmente, mas falhou na nuvem. Tente novamente.",
        };
      }
    }
  } catch {
    /* offline — senha local já foi alterada */
  }

  return { success: true };
}

export function getAdminAreaSnapshot(data: AppData, cooperativaId?: string): AdminAreaSnapshot {
  const mes = getCurrentMesReferencia();
  const coopIds = cooperadoIdsDaCoop(data, cooperativaId);

  const filtrarCoop = <T,>(items: T[], getter: (item: T) => string): T[] =>
    cooperativaId ? items.filter((item) => coopIds.has(getter(item))) : items;

  const scoped: AppData = cooperativaId
    ? {
        ...data,
        cooperados: data.cooperados.filter((c) => c.cooperativaId === cooperativaId),
        notasPedido: data.notasPedido.filter(
          (n) => notaPertenceCooperativa(data, n, cooperativaId)
        ),
        fichaCorrida: filtrarCoop(data.fichaCorrida, (f) => f.cooperadoId),
        mensalidades: filtrarCoop(data.mensalidades, (m) => m.cooperadoId),
        cotas: filtrarCoop(data.cotas, (c) => c.cooperadoId),
        pagamentosCooperado: filtrarCoop(data.pagamentosCooperado, (p) => p.cooperadoId),
        instituicoes: data.instituicoes.filter((i) => !cooperativaId || i.cooperativaId === cooperativaId),
      }
    : data;

  const stats = getAdminStats(scoped);
  const resumoFinanceiro = getRelatorioResumoFinanceiro(mes, scoped);
  const relatorioPagar = getRelatorioPagarCooperado(mes, scoped);

  const entregasAguardando = scoped.notasPedido
    .filter((n) => n.status === "aguardando_conferencia")
    .slice(0, 8)
    .map((n) => ({
      id: n.id,
      cooperadoNome: getCooperadoNome(data.cooperados, n.cooperadoId),
      instituicao: data.instituicoes.find((i) => i.id === n.instituicaoId)?.nome ?? "—",
      dataEntrega: n.dataEntrega,
    }));

  const pagamentosPendentes = relatorioPagar
    .slice(0, 8)
    .map((l) => ({
      cooperadoId: "",
      cooperadoNome: l.cooperado,
      valor: l.total,
      mes,
    }));

  const mensalidadesAtrasadas = scoped.mensalidades.filter((m) => m.status === "atrasada").length;
  const cotasAtrasadas = scoped.cotas.filter((c) => c.status === "atrasada").length;
  const instituicoesAtivas = scoped.instituicoes.length;

  const alertas: AdminAreaAlert[] = [];

  if (stats.entregasPendentes > 0) {
    alertas.push({
      id: "entregas",
      severity: "warning",
      title: "Entregas aguardando conferência",
      description: `${stats.entregasPendentes} foto(s) enviada(s) pelos cooperados precisam de análise.`,
      href: "/notas-pedido",
      count: stats.entregasPendentes,
    });
  }

  if (stats.valoresAPagar > 0) {
    alertas.push({
      id: "pagar",
      severity: stats.pagamentosPendentes > 3 ? "critical" : "warning",
      title: "Valores a pagar aos cooperados",
      description: `Total pendente: ${formatCurrency(stats.valoresAPagar)} em ${stats.pagamentosPendentes} lançamento(s).`,
      href: "/ficha-corrida",
      count: stats.pagamentosPendentes,
    });
  }

  if (mensalidadesAtrasadas > 0) {
    alertas.push({
      id: "mens-atrasada",
      severity: "critical",
      title: "Mensalidades em atraso",
      description: `${mensalidadesAtrasadas} cooperado(s) com mensalidade atrasada.`,
      href: "/mensalidades",
      count: mensalidadesAtrasadas,
    });
  }

  if (cotasAtrasadas > 0) {
    alertas.push({
      id: "cotas-atrasada",
      severity: "warning",
      title: "Cotas em atraso",
      description: `${cotasAtrasadas} cota(s) com parcela(s) atrasada(s).`,
      href: "/cotas",
      count: cotasAtrasadas,
    });
  }

  if (stats.debitosAbertos > 0 && mensalidadesAtrasadas === 0) {
    alertas.push({
      id: "debitos",
      severity: "info",
      title: "Débitos em aberto",
      description: `Saldo de débitos (mensalidades + cotas): ${formatCurrency(stats.debitosAbertos)}.`,
      href: "/mensalidades",
    });
  }

  const pagamentosAguardando = scoped.pagamentosCooperado.filter(
    (p) => p.mesReferencia === mes && p.status === "aguardando_confirmacao"
  ).length;
  if (pagamentosAguardando > 0) {
    alertas.push({
      id: "assinaturas",
      severity: "info",
      title: "Recibos aguardando assinatura",
      description: `${pagamentosAguardando} pagamento(s) aguardando confirmação do cooperado.`,
      href: "/ficha-corrida",
      count: pagamentosAguardando,
    });
  }

  const auditRecente = data.auditLog
    .filter((a) => !cooperativaId || a.entityId === cooperativaId || coopIds.has(a.entityId))
    .slice(0, 12);

  return {
    mesReferencia: mes,
    stats,
    resumoFinanceiro,
    alertas,
    entregasAguardando,
    pagamentosPendentes,
    mensalidadesAtrasadas,
    cotasAtrasadas,
    instituicoesAtivas,
    auditRecente,
  };
}

export function totalOperacionalCooperativa(data: AppData, cooperativaId: string): {
  notas: number;
  cooperados: number;
  fichaPendente: number;
} {
  const coopIds = cooperadoIdsDaCoop(data, cooperativaId);
  const notas = data.notasPedido.filter((n) => notaPertenceCooperativa(data, n, cooperativaId)).length;
  const cooperados = coopIds.size;
  const fichaPendente = sumBy(
    data.fichaCorrida.filter((f) => coopIds.has(f.cooperadoId) && f.status === "pendente"),
    (f) => f.valorLiquido
  );
  return { notas, cooperados, fichaPendente };
}
